-- =============================================================================
-- M4. Doctor Verification
-- Tables: verification_requests, verification_documents, verification_events
-- Storage: private bucket "verification-docs", objects stored as <user_id>/<uuid>.<ext>
--
-- Flow: draft -> (submit) -> pending -> (admin) approved | rejected
--       rejected -> doctor edits documents -> (submit) -> pending ...
--       approved -> (admin revoke) -> rejected
-- One request per doctor; every submit/decision is kept in verification_events.
-- Status changes happen ONLY through the SECURITY DEFINER functions below,
-- which also keep doctor_profiles.is_verified in sync.
-- Requires: M1 (users, is_admin, current_user_role), M2 (set_updated_at),
--           M3 (doctor_profiles, doctor_specialties).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- verification_requests
-- -----------------------------------------------------------------------------
create table if not exists public.verification_requests (
  id               uuid primary key default gen_random_uuid(),
  doctor_id        uuid not null unique references public.doctor_profiles (user_id) on delete cascade,
  status           text not null default 'draft'
                   check (status in ('draft', 'pending', 'approved', 'rejected')),
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      uuid references public.users (id) on delete set null,
  rejection_reason text check (char_length(rejection_reason) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists verification_requests_status_idx
  on public.verification_requests (status, submitted_at);

drop trigger if exists verification_requests_set_updated_at on public.verification_requests;
create trigger verification_requests_set_updated_at
  before update on public.verification_requests
  for each row execute function public.set_updated_at();

alter table public.verification_requests enable row level security;

create policy "doctors can read own request"
  on public.verification_requests for select
  to authenticated
  using (doctor_id = auth.uid());

create policy "admins can read all requests"
  on public.verification_requests for select
  to authenticated
  using (public.is_admin());

-- Doctors may only open a fresh draft for themselves. No UPDATE/DELETE grants:
-- status changes go through submit/review functions.
create policy "doctors can create own draft request"
  on public.verification_requests for insert
  to authenticated
  with check (
    doctor_id = auth.uid()
    and status = 'draft'
    and public.current_user_role() = 'doctor'
  );

revoke all on public.verification_requests from anon;
revoke update, delete on public.verification_requests from authenticated;
grant select, insert on public.verification_requests to authenticated;

-- True when the doctor may still change the documents on their request.
create or replace function public.verification_request_editable(request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.verification_requests r
    where r.id = request
      and r.doctor_id = auth.uid()
      and r.status in ('draft', 'rejected')
  );
$$;

revoke execute on function public.verification_request_editable(uuid) from public, anon;
grant execute on function public.verification_request_editable(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- verification_documents
-- -----------------------------------------------------------------------------
create table if not exists public.verification_documents (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.verification_requests (id) on delete cascade,
  doctor_id    uuid not null default auth.uid() references public.doctor_profiles (user_id) on delete cascade,
  doc_type     text not null check (doc_type in ('license', 'degree', 'national_id', 'other')),
  label        text check (char_length(label) <= 120),
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) <= 255),
  mime_type    text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes   integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at   timestamptz not null default now(),
  constraint verification_documents_path_owner check (storage_path like doctor_id::text || '/%')
);

create index if not exists verification_documents_request_idx
  on public.verification_documents (request_id);

alter table public.verification_documents enable row level security;

create policy "doctors can read own documents"
  on public.verification_documents for select
  to authenticated
  using (doctor_id = auth.uid());

create policy "admins can read all documents"
  on public.verification_documents for select
  to authenticated
  using (public.is_admin());

create policy "doctors can add documents to an editable request"
  on public.verification_documents for insert
  to authenticated
  with check (doctor_id = auth.uid() and public.verification_request_editable(request_id));

create policy "doctors can remove documents from an editable request"
  on public.verification_documents for delete
  to authenticated
  using (doctor_id = auth.uid() and public.verification_request_editable(request_id));

revoke all on public.verification_documents from anon;
revoke update on public.verification_documents from authenticated;
grant select, insert, delete on public.verification_documents to authenticated;

-- -----------------------------------------------------------------------------
-- verification_events (append-only history, written by functions only)
-- -----------------------------------------------------------------------------
create table if not exists public.verification_events (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.verification_requests (id) on delete cascade,
  action     text not null check (action in ('submitted', 'approved', 'rejected', 'revoked')),
  actor_id   uuid references public.users (id) on delete set null,
  reason     text check (char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists verification_events_request_idx
  on public.verification_events (request_id, created_at);

alter table public.verification_events enable row level security;

create policy "doctors can read own request history"
  on public.verification_events for select
  to authenticated
  using (exists (
    select 1 from public.verification_requests r
    where r.id = request_id and r.doctor_id = auth.uid()
  ));

create policy "admins can read all request history"
  on public.verification_events for select
  to authenticated
  using (public.is_admin());

revoke all on public.verification_events from anon;
revoke insert, update, delete on public.verification_events from authenticated;
grant select on public.verification_events to authenticated;

-- -----------------------------------------------------------------------------
-- submit_verification_request(): doctor submits their draft/rejected request
-- -----------------------------------------------------------------------------
create or replace function public.submit_verification_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.verification_requests;
  prof public.doctor_profiles;
  missing text[] := '{}';
begin
  if public.current_user_role() is distinct from 'doctor' then
    raise exception 'Only doctors can submit verification requests' using errcode = '42501';
  end if;

  select * into req from public.verification_requests
   where doctor_id = auth.uid()
   for update;
  if not found then
    raise exception 'No verification request found' using errcode = 'P0002';
  end if;
  if req.status not in ('draft', 'rejected') then
    raise exception 'This request has already been submitted' using errcode = '22023';
  end if;

  select * into prof from public.doctor_profiles where user_id = auth.uid();
  if coalesce(trim(prof.license_number), '') = '' then
    missing := missing || 'license number in your portfolio'::text;
  end if;
  if not exists (select 1 from public.doctor_specialties where doctor_id = auth.uid()) then
    missing := missing || 'at least one specialty in your portfolio'::text;
  end if;
  if not exists (select 1 from public.verification_documents where request_id = req.id and doc_type = 'license') then
    missing := missing || 'medical license document'::text;
  end if;
  if not exists (select 1 from public.verification_documents where request_id = req.id and doc_type = 'degree') then
    missing := missing || 'degree certificate'::text;
  end if;
  if not exists (select 1 from public.verification_documents where request_id = req.id and doc_type = 'national_id') then
    missing := missing || 'national ID'::text;
  end if;
  if cardinality(missing) > 0 then
    raise exception 'Missing: %', array_to_string(missing, ', ') using errcode = '22023';
  end if;

  update public.verification_requests
     set status = 'pending',
         submitted_at = now(),
         reviewed_at = null,
         reviewed_by = null
   where id = req.id;

  insert into public.verification_events (request_id, action, actor_id)
  values (req.id, 'submitted', auth.uid());
end;
$$;

revoke execute on function public.submit_verification_request() from public, anon;
grant execute on function public.submit_verification_request() to authenticated;

-- -----------------------------------------------------------------------------
-- review_verification_request(): admin approves, rejects or revokes
--   decision: 'approve'  (pending  -> approved)
--             'reject'   (pending  -> rejected, reason required)
--             'revoke'   (approved -> rejected, reason required)
-- -----------------------------------------------------------------------------
create or replace function public.review_verification_request(
  p_request_id uuid,
  p_decision text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.verification_requests;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only admins can review verification requests' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject', 'revoke') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  if p_decision in ('reject', 'revoke') and (reason is null or char_length(reason) < 10) then
    raise exception 'Please give a reason (at least 10 characters)' using errcode = '22023';
  end if;

  select * into req from public.verification_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if p_decision in ('approve', 'reject') and req.status <> 'pending' then
    raise exception 'Only pending requests can be approved or rejected' using errcode = '22023';
  end if;
  if p_decision = 'revoke' and req.status <> 'approved' then
    raise exception 'Only approved requests can be revoked' using errcode = '22023';
  end if;

  update public.verification_requests
     set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         rejection_reason = case when p_decision = 'approve' then null else reason end
   where id = req.id;

  update public.doctor_profiles
     set is_verified = (p_decision = 'approve')
   where user_id = req.doctor_id;

  insert into public.verification_events (request_id, action, actor_id, reason)
  values (
    req.id,
    case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'revoked' end,
    auth.uid(),
    reason
  );
end;
$$;

revoke execute on function public.review_verification_request(uuid, text, text) from public, anon;
grant execute on function public.review_verification_request(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: private bucket for verification documents
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-docs', 'verification-docs', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "doctors can upload own verification docs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_role() = 'doctor'
  );

create policy "doctors can read own verification docs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "admins can read all verification docs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'verification-docs' and public.is_admin());

create policy "doctors can delete own verification docs"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- Backfill: doctors verified by hand during M3 testing get an approved request
-- so the admin screens show them correctly.
-- -----------------------------------------------------------------------------
insert into public.verification_requests (doctor_id, status, submitted_at, reviewed_at)
select user_id, 'approved', coalesce(verified_at, now()), coalesce(verified_at, now())
from public.doctor_profiles
where is_verified
on conflict (doctor_id) do nothing;
