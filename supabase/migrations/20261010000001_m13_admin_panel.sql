-- =============================================================================
-- M13. Admin panel: complaints, analytics, specialties & lab tests
-- Tables: complaints, complaint_messages, lab_tests
-- Functions: file_complaint, reply_complaint, admin_update_complaint,
--            create_complaint_refund (service role), admin_analytics
--
-- * FR-A-05: patients and doctors file complaints (optionally about an
--   appointment); admins reply (or add internal notes), set priority/status,
--   resolve or reject with a reason, and refund part or all of a payment.
-- * FR-A-07: analytics for a date range (Bangladesh time) — bookings, visits,
--   cancellations, revenue, commission, refunds, active doctors, top
--   specialties and doctors, online vs in-person.
-- * FR-A-03: admins add/rename/hide specialties and manage the lab test list
--   used by the prescription editor (medicines were done in M10).
-- Requires: M1-M14.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Specialties: admins can add and edit (slug is fixed once created)
-- -----------------------------------------------------------------------------
drop policy if exists "admins add specialties" on public.specialties;
create policy "admins add specialties" on public.specialties for insert to authenticated
  with check (public.is_admin());
drop policy if exists "admins update specialties" on public.specialties;
create policy "admins update specialties" on public.specialties for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant insert, update on public.specialties to authenticated;
revoke delete on public.specialties from authenticated;

create or replace function public.guard_specialty_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'A specialty''s web address can''t be changed once created' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists specialties_slug_fixed on public.specialties;
create trigger specialties_slug_fixed before update on public.specialties
  for each row execute function public.guard_specialty_slug();

-- -----------------------------------------------------------------------------
-- Lab tests (quick picks in the prescription editor)
-- -----------------------------------------------------------------------------
create table if not exists public.lab_tests (
  id         smallint generated always as identity primary key,
  name       text not null check (char_length(trim(name)) between 2 and 100),
  category   text not null default 'other' check (category in ('blood', 'urine_stool', 'imaging', 'cardiac', 'other')),
  is_active  boolean not null default true,
  sort_order smallint not null default 100,
  created_at timestamptz not null default now()
);

create unique index if not exists lab_tests_name_unique on public.lab_tests (lower(trim(name)));

alter table public.lab_tests enable row level security;
create policy "signed-in users read lab tests" on public.lab_tests for select to authenticated using (true);
create policy "admins add lab tests" on public.lab_tests for insert to authenticated with check (public.is_admin());
create policy "admins update lab tests" on public.lab_tests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.lab_tests from anon;
revoke delete on public.lab_tests from authenticated;
grant select, insert, update on public.lab_tests to authenticated;

insert into public.lab_tests (name, category, sort_order) values
  ('CBC', 'blood', 10), ('ESR', 'blood', 20), ('RBS', 'blood', 30), ('FBS', 'blood', 40), ('2HABF', 'blood', 50),
  ('HbA1c', 'blood', 60), ('Lipid profile', 'blood', 70), ('S. creatinine', 'blood', 80), ('SGPT (ALT)', 'blood', 90),
  ('S. electrolytes', 'blood', 100), ('TSH', 'blood', 110), ('CRP', 'blood', 120), ('Dengue NS1', 'blood', 130),
  ('Urine R/E', 'urine_stool', 10), ('Stool R/E', 'urine_stool', 20),
  ('Chest X-ray P/A view', 'imaging', 10), ('USG of whole abdomen', 'imaging', 20),
  ('ECG', 'cardiac', 10), ('Echocardiogram', 'cardiac', 20)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Complaints
-- -----------------------------------------------------------------------------
create table if not exists public.complaints (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  complainant_id   uuid not null references public.users (id) on delete cascade,
  complainant_role text not null check (complainant_role in ('patient', 'doctor')),
  against_user_id  uuid references public.users (id) on delete set null,
  appointment_id   uuid references public.appointments (id) on delete set null,
  category         text not null check (category in (
                     'appointment', 'payment', 'doctor_conduct', 'patient_conduct', 'prescription',
                     'video_call', 'privacy', 'technical', 'other')),
  subject          text not null check (char_length(trim(subject)) between 5 and 120),
  description      text not null check (char_length(trim(description)) between 10 and 3000),
  status           text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'rejected')),
  priority         text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  resolution       text check (char_length(resolution) <= 2000),
  resolved_by      uuid references public.users (id) on delete set null,
  resolved_at      timestamptz,
  refund_id        uuid references public.refunds (id) on delete set null,
  refund_amount    numeric(10, 2),
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists complaints_queue_idx on public.complaints (status, last_activity_at desc);
create index if not exists complaints_user_idx on public.complaints (complainant_id, created_at desc);
create index if not exists complaints_appt_idx on public.complaints (appointment_id);

drop trigger if exists complaints_set_updated_at on public.complaints;
create trigger complaints_set_updated_at before update on public.complaints
  for each row execute function public.set_updated_at();

create table if not exists public.complaint_messages (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  author_id    uuid references public.users (id) on delete set null,
  author_role  text not null check (author_role in ('patient', 'doctor', 'admin', 'system')),
  kind         text not null default 'message' check (kind in ('message', 'status', 'refund')),
  body         text not null check (char_length(trim(body)) between 1 and 3000),
  is_internal  boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists complaint_messages_thread_idx on public.complaint_messages (complaint_id, created_at);

alter table public.complaints enable row level security;
alter table public.complaint_messages enable row level security;

create policy "complainants read own complaints" on public.complaints for select to authenticated
  using (complainant_id = auth.uid());
create policy "admins read complaints" on public.complaints for select to authenticated
  using (public.is_admin());
create policy "complainants read public messages" on public.complaint_messages for select to authenticated
  using (not is_internal and exists (
    select 1 from public.complaints c where c.id = complaint_id and c.complainant_id = auth.uid()));
create policy "admins read complaint messages" on public.complaint_messages for select to authenticated
  using (public.is_admin());

revoke all on public.complaints, public.complaint_messages from anon;
revoke insert, update, delete on public.complaints, public.complaint_messages from authenticated;
grant select on public.complaints, public.complaint_messages to authenticated;

-- Where each party sees a complaint.
create or replace function public.complaint_link(p_complaint uuid, p_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_role when 'admin' then '/admin/complaints/' when 'doctor' then '/doctor/complaints/' else '/patient/complaints/' end
         || p_complaint::text;
$$;

-- File a complaint (patient or doctor).
create or replace function public.file_complaint(
  p_category    text,
  p_subject     text,
  p_description text,
  p_appointment uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me      public.users;
  a       public.appointments;
  against uuid;
  cid     uuid;
  v_code  text;
  adm     uuid;
begin
  select * into me from public.users where id = auth.uid();
  if not found or me.status <> 'active' or me.role not in ('patient', 'doctor') then
    raise exception 'Only patients and doctors can file complaints' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_subject, ''))) < 5 then
    raise exception 'Add a short subject (at least 5 characters)' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_description, ''))) < 10 then
    raise exception 'Describe what happened (at least 10 characters)' using errcode = '22023';
  end if;
  if (select count(*) from public.complaints c where c.complainant_id = me.id and c.status in ('open', 'in_review')) >= 5 then
    raise exception 'You already have 5 open complaints. Please wait for a reply before filing another.' using errcode = '22023';
  end if;

  if p_appointment is not null then
    select * into a from public.appointments where id = p_appointment and (patient_id = me.id or doctor_id = me.id);
    if not found then
      raise exception 'Appointment not found' using errcode = 'P0002';
    end if;
    against := case when a.patient_id = me.id then a.doctor_id else a.patient_id end;
  end if;

  v_code := 'C' || to_char(now() at time zone 'Asia/Dhaka', 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  insert into public.complaints (code, complainant_id, complainant_role, against_user_id, appointment_id, category, subject, description)
  values (v_code, me.id, me.role, against, p_appointment, p_category, trim(p_subject), trim(p_description))
  returning id into cid;

  for adm in select u.id from public.users u where u.role = 'admin' and u.status = 'active' loop
    perform public.notify(adm, 'complaint_new', 'New complaint ' || v_code,
      left(trim(p_subject), 160), public.complaint_link(cid, 'admin'), null, 'complaint:' || cid || ':' || adm);
  end loop;
  return cid;
end;
$$;

-- Add a message. Admins may add internal notes the complainant never sees.
create or replace function public.reply_complaint(p_complaint uuid, p_body text, p_internal boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me       public.users;
  c        public.complaints;
  is_admin boolean;
  mid      uuid;
  adm      uuid;
begin
  select * into me from public.users where id = auth.uid();
  select * into c from public.complaints where id = p_complaint for update;
  if not found or me.id is null then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;
  is_admin := me.role = 'admin' and me.status = 'active';
  if not is_admin and c.complainant_id <> me.id then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Write a message first' using errcode = '22023';
  end if;
  if not is_admin and c.status not in ('open', 'in_review') then
    raise exception 'This complaint is closed. File a new one if you still need help.' using errcode = '22023';
  end if;

  insert into public.complaint_messages (complaint_id, author_id, author_role, body, is_internal)
  values (c.id, me.id, case when is_admin then 'admin' else me.role end, left(trim(p_body), 3000), is_admin and coalesce(p_internal, false))
  returning id into mid;

  update public.complaints
     set last_activity_at = now(),
         status = case when is_admin and not coalesce(p_internal, false) and status = 'open' then 'in_review' else status end
   where id = c.id;

  if is_admin and not coalesce(p_internal, false) then
    perform public.notify(c.complainant_id, 'complaint_reply', 'Reply to your complaint ' || c.code,
      left(trim(p_body), 160), public.complaint_link(c.id, c.complainant_role), null, 'complaintmsg:' || mid);
  elsif not is_admin then
    for adm in select u.id from public.users u where u.role = 'admin' and u.status = 'active' loop
      perform public.notify(adm, 'complaint_reply', 'New reply on complaint ' || c.code,
        left(trim(p_body), 160), public.complaint_link(c.id, 'admin'), null,
        'complaintreply:' || c.id || ':' || adm || ':' || floor(extract(epoch from now()) / 900)::bigint);
    end loop;
  end if;
  return mid;
end;
$$;

-- Admin: status / priority / resolution.
create or replace function public.admin_update_complaint(
  p_complaint  uuid,
  p_status     text,
  p_priority   text default null,
  p_resolution text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  c      public.complaints;
  v_res  text := nullif(trim(coalesce(p_resolution, '')), '');
  closed boolean := p_status in ('resolved', 'rejected');
  label  text;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into c from public.complaints where id = p_complaint for update;
  if not found then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;
  if p_status not in ('open', 'in_review', 'resolved', 'rejected') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  if closed and (v_res is null or char_length(v_res) < 5) then
    raise exception 'Explain the outcome — the complainant will see it' using errcode = '22023';
  end if;

  update public.complaints
     set status = p_status,
         priority = coalesce(nullif(p_priority, ''), priority),
         resolution = case when closed then left(v_res, 2000) else resolution end,
         resolved_by = case when closed then me else null end,
         resolved_at = case when closed then now() else null end,
         last_activity_at = now()
   where id = c.id;

  if p_status is distinct from c.status then
    label := case p_status when 'in_review' then 'In review' when 'resolved' then 'Resolved' when 'rejected' then 'Closed without action' else 'Reopened' end;
    insert into public.complaint_messages (complaint_id, author_id, author_role, kind, body)
    values (c.id, me, 'admin', 'status', label || coalesce(': ' || case when closed then v_res end, ''));
    perform public.notify(c.complainant_id, 'complaint_status', 'Complaint ' || c.code || ': ' || lower(label),
      case when closed then left(v_res, 160) end, public.complaint_link(c.id, c.complainant_role), null,
      'complaintstatus:' || c.id || ':' || p_status || ':' || txid_current());
  end if;
end;
$$;

-- Refund part/all of the appointment's payment for a complaint. SERVICE ROLE ONLY
-- (the app checks the caller is an admin, then sends it to the gateway).
create or replace function public.create_complaint_refund(p_complaint uuid, p_amount numeric, p_admin uuid)
returns table (refund_id uuid, amount numeric, bank_tran_id text, provider text, tran_id text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  c         public.complaints;
  p         public.payments;
  refunded  numeric;
  rid       uuid;
begin
  if not exists (select 1 from public.users u where u.id = p_admin and u.role = 'admin' and u.status = 'active') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into c from public.complaints where id = p_complaint for update;
  if not found or c.appointment_id is null then
    raise exception 'This complaint isn''t linked to a paid appointment' using errcode = '22023';
  end if;
  select * into p from public.payments where appointment_id = c.appointment_id and status = 'paid' for update;
  if not found then
    raise exception 'No online payment was made for this appointment' using errcode = '22023';
  end if;
  select coalesce(sum(r.amount), 0) into refunded
    from public.refunds r where r.payment_id = p.id and r.status in ('pending', 'processing', 'succeeded');
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount above zero' using errcode = '22023';
  end if;
  if p_amount > p.amount - refunded then
    raise exception 'At most % can still be refunded', p.amount - refunded using errcode = '22023';
  end if;

  insert into public.refunds (payment_id, appointment_id, amount, reason, status, attempts)
  values (p.id, c.appointment_id, round(p_amount, 2), 'Complaint ' || c.code, 'processing', 1)
  returning id into rid;

  update public.complaints
     set refund_id = rid, refund_amount = coalesce(refund_amount, 0) + round(p_amount, 2), last_activity_at = now()
   where id = c.id;
  insert into public.complaint_messages (complaint_id, author_id, author_role, kind, body)
  values (c.id, p_admin, 'admin', 'refund', 'Refund of ৳' || round(p_amount, 2) || ' started. It usually reaches the original payment method in 3–7 working days.');

  return query select rid, round(p_amount, 2), p.bank_tran_id, p.provider, p.tran_id;
end;
$$;

revoke execute on function public.file_complaint(text, text, text, uuid) from public, anon;
revoke execute on function public.reply_complaint(uuid, text, boolean) from public, anon;
revoke execute on function public.admin_update_complaint(uuid, text, text, text) from public, anon;
revoke execute on function public.create_complaint_refund(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.file_complaint(text, text, text, uuid) to authenticated;
grant execute on function public.reply_complaint(uuid, text, boolean) to authenticated;
grant execute on function public.admin_update_complaint(uuid, text, text, text) to authenticated;
grant execute on function public.create_complaint_refund(uuid, numeric, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Audit (M14): complaint handling and catalogue changes by admins
-- -----------------------------------------------------------------------------
create or replace function public.audit_m13_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'complaints' then
    if tg_op = 'UPDATE' and new.status is distinct from old.status and public.is_admin() then
      perform public.audit_write('admin', 'complaint.' || new.status, 'complaint', new.id::text, null,
        jsonb_strip_nulls(jsonb_build_object('code', new.code, 'from', old.status, 'resolution', left(new.resolution, 200))));
    end if;
    if tg_op = 'UPDATE' and new.refund_amount is distinct from old.refund_amount then
      perform public.audit_write('admin', 'complaint.refund', 'complaint', new.id::text, null,
        jsonb_build_object('code', new.code, 'total_refunded', new.refund_amount));
    end if;
  elsif tg_table_name = 'specialties' and public.is_admin() then
    perform public.audit_write('admin', case when tg_op = 'INSERT' then 'specialty.add' else 'specialty.update' end,
      'specialty', new.id::text, null,
      jsonb_build_object('name', new.name, 'active', new.is_active));
  elsif tg_table_name = 'lab_tests' and public.is_admin() then
    perform public.audit_write('admin', case when tg_op = 'INSERT' then 'lab_test.add' else 'lab_test.update' end,
      'lab_test', new.id::text, null,
      jsonb_build_object('name', new.name, 'active', new.is_active));
  end if;
  return null;
end;
$$;

drop trigger if exists audit_complaints on public.complaints;
create trigger audit_complaints after update on public.complaints
  for each row execute function public.audit_m13_change();
drop trigger if exists audit_specialties on public.specialties;
create trigger audit_specialties after insert or update on public.specialties
  for each row execute function public.audit_m13_change();
drop trigger if exists audit_lab_tests on public.lab_tests;
create trigger audit_lab_tests after insert or update on public.lab_tests
  for each row execute function public.audit_m13_change();

-- -----------------------------------------------------------------------------
-- Analytics (FR-A-07). Dates are Bangladesh calendar days, max 366 days.
-- -----------------------------------------------------------------------------
create or replace function public.admin_analytics(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz      constant text := 'Asia/Dhaka';
  v_from  date := least(p_from, p_to);
  v_to    date := greatest(p_from, p_to);
  t_start timestamptz;
  t_end   timestamptz;
  result  jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_from is null or v_to is null then
    raise exception 'Choose a date range' using errcode = '22023';
  end if;
  if v_to - v_from > 366 then
    v_from := v_to - 366;
  end if;
  t_start := v_from::timestamp at time zone tz;
  t_end := (v_to + 1)::timestamp at time zone tz;

  with
  days as (
    select d::date as day from generate_series(v_from, v_to, interval '1 day') d
  ),
  booked as (
    select (a.created_at at time zone tz)::date as day, count(*) as n
      from public.appointments a
     where a.created_at >= t_start and a.created_at < t_end and a.status <> 'expired'
     group by 1
  ),
  done as (
    select (a.slot_start at time zone tz)::date as day, count(*) as n
      from public.appointments a
     where a.slot_start >= t_start and a.slot_start < t_end and a.status = 'completed'
     group by 1
  ),
  cancelled as (
    select (a.cancelled_at at time zone tz)::date as day, count(*) as n
      from public.appointments a
     where a.cancelled_at >= t_start and a.cancelled_at < t_end and a.status = 'cancelled'
     group by 1
  ),
  paid as (
    select (p.paid_at at time zone tz)::date as day, sum(p.amount) as gross, sum(coalesce(p.commission_amount, 0)) as commission
      from public.payments p
     where p.status = 'paid' and p.paid_at >= t_start and p.paid_at < t_end
     group by 1
  ),
  refunded as (
    select (r.updated_at at time zone tz)::date as day, sum(r.amount) as amount
      from public.refunds r
     where r.status = 'succeeded' and r.amount > 0 and r.updated_at >= t_start and r.updated_at < t_end
     group by 1
  ),
  series as (
    select jsonb_agg(jsonb_build_object(
             'day', d.day,
             'bookings', coalesce(b.n, 0),
             'completed', coalesce(dn.n, 0),
             'cancelled', coalesce(c.n, 0),
             'revenue', coalesce(p.gross, 0),
             'commission', coalesce(p.commission, 0),
             'refunds', coalesce(r.amount, 0)
           ) order by d.day) as rows
      from days d
      left join booked b on b.day = d.day
      left join done dn on dn.day = d.day
      left join cancelled c on c.day = d.day
      left join paid p on p.day = d.day
      left join refunded r on r.day = d.day
  ),
  visits as (
    select a.*
      from public.appointments a
     where a.slot_start >= t_start and a.slot_start < t_end and a.status <> 'expired'
  ),
  visit_totals as (
    select count(*) as total,
           count(*) filter (where status = 'completed') as completed,
           count(*) filter (where status = 'cancelled') as cancelled,
           count(*) filter (where status = 'no_show') as no_show,
           count(*) filter (where status in ('pending_payment', 'confirmed', 'in_progress')) as upcoming,
           count(*) filter (where status = 'cancelled' and cancelled_by = patient_id) as by_patient,
           count(*) filter (where status = 'cancelled' and cancelled_by = doctor_id) as by_doctor,
           count(*) filter (where status = 'cancelled' and cancelled_by is distinct from patient_id and cancelled_by is distinct from doctor_id) as by_admin,
           count(*) filter (where consultation_type = 'online' and status <> 'cancelled') as online,
           count(*) filter (where consultation_type = 'in_person' and status <> 'cancelled') as in_person,
           count(distinct doctor_id) filter (where status = 'completed') as active_doctors,
           count(distinct patient_id) filter (where status in ('completed', 'confirmed', 'in_progress')) as active_patients
      from visits
  ),
  primary_specialty as (
    select distinct on (ds.doctor_id) ds.doctor_id, s.name
      from public.doctor_specialties ds join public.specialties s on s.id = ds.specialty_id
     order by ds.doctor_id, ds.is_primary desc, s.name
  ),
  top_specialties as (
    select coalesce(jsonb_agg(x order by x.visits desc, x.name), '[]'::jsonb) as rows from (
      select coalesce(ps.name, 'Not set') as name,
             count(*) filter (where v.status <> 'cancelled') as visits,
             count(*) filter (where v.status = 'completed') as completed,
             coalesce(sum(p.amount) filter (where p.status = 'paid'), 0) as revenue
        from visits v
        left join primary_specialty ps on ps.doctor_id = v.doctor_id
        left join public.payments p on p.appointment_id = v.id and p.status = 'paid'
       group by 1
       order by 2 desc
       limit 8
    ) x
  ),
  top_doctors as (
    select coalesce(jsonb_agg(x order by x.completed desc, x.visits desc), '[]'::jsonb) as rows from (
      select v.doctor_id as id, d.display_name as name, d.slug,
             ps.name as specialty,
             count(*) filter (where v.status <> 'cancelled') as visits,
             count(*) filter (where v.status = 'completed') as completed,
             count(*) filter (where v.status = 'cancelled' and v.cancelled_by = v.doctor_id) as doctor_cancellations,
             coalesce(sum(p.amount), 0) as revenue,
             rs.rating_avg, coalesce(rs.review_count, 0) as reviews
        from visits v
        join public.doctor_profiles d on d.user_id = v.doctor_id
        left join primary_specialty ps on ps.doctor_id = v.doctor_id
        left join public.payments p on p.appointment_id = v.id and p.status = 'paid'
        left join public.doctor_rating_stats rs on rs.doctor_id = v.doctor_id
       group by v.doctor_id, d.display_name, d.slug, ps.name, rs.rating_avg, rs.review_count
       order by count(*) filter (where v.status = 'completed') desc, count(*) desc
       limit 10
    ) x
  ),
  money as (
    select coalesce((select sum(gross) from paid), 0) as gross,
           coalesce((select sum(commission) from paid), 0) as commission,
           coalesce((select sum(amount) from refunded), 0) as refunds,
           (select count(*) from public.payments p where p.status = 'paid' and p.paid_at >= t_start and p.paid_at < t_end) as payments
  ),
  people as (
    select count(*) filter (where u.role = 'patient') as new_patients,
           count(*) filter (where u.role = 'doctor') as new_doctors
      from public.users u
     where u.created_at >= t_start and u.created_at < t_end
  ),
  complaints as (
    select count(*) as filed,
           count(*) filter (where c.status in ('resolved', 'rejected')) as closed
      from public.complaints c
     where c.created_at >= t_start and c.created_at < t_end
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'series', coalesce((select rows from series), '[]'::jsonb),
    'bookings', coalesce((select sum(n) from booked), 0),
    'visits', (select to_jsonb(vt) from visit_totals vt),
    'money', (select to_jsonb(m) from money m),
    'people', (select to_jsonb(pp) from people pp),
    'complaints', (select to_jsonb(cc) from complaints cc),
    'verified_doctors', (select count(*) from public.doctor_profiles d where d.is_verified),
    'top_specialties', (select rows from top_specialties),
    'top_doctors', (select rows from top_doctors)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.admin_analytics(date, date) from public, anon;
grant execute on function public.admin_analytics(date, date) to authenticated;
