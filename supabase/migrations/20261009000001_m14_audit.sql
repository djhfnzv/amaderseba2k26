-- =============================================================================
-- M14. Audit & security
-- Table: audit_logs (append-only)
-- Functions: audit_write, my_record_access, purge_audit_logs
--
-- * NFR-03 / FR-A-08: every create/update/delete of medical data and
--   prescriptions is logged here by triggers; views and downloads are logged
--   by the app (a database can't see reads).
-- * Security events (logins, failed logins, password changes, sign-ups,
--   suspensions, role changes) and admin actions (verification, settings,
--   payouts, refunds, review moderation, medicine list) are logged too.
-- * Nobody can edit or delete a log row, admins included. Only the nightly
--   retention job removes rows older than 2 years.
-- * Patients can see who opened their records ("Access history").
-- * The app passes the visitor's IP and browser as x-medlife-ip / x-medlife-ua
--   request headers, which triggers read from request.headers.
-- Requires: M1-M12.
-- =============================================================================

create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  -- No foreign keys on purpose: log rows must outlive deleted accounts.
  actor_id    uuid,
  actor_role  text check (char_length(actor_role) <= 20),
  actor_label text check (char_length(actor_label) <= 200),
  category    text not null check (category in ('medical', 'prescription', 'verification', 'security', 'admin')),
  action      text not null check (char_length(action) between 3 and 60),
  target_type text check (char_length(target_type) <= 40),
  target_id   text check (char_length(target_id) <= 80),
  patient_id  uuid,
  success     boolean not null default true,
  ip          text check (char_length(ip) <= 64),
  user_agent  text check (char_length(user_agent) <= 300),
  metadata    jsonb not null default '{}'::jsonb
);

create index if not exists audit_logs_time_idx on public.audit_logs (occurred_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);
create index if not exists audit_logs_patient_idx on public.audit_logs (patient_id, occurred_at desc) where patient_id is not null;
create index if not exists audit_logs_category_idx on public.audit_logs (category, occurred_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action, occurred_at desc);

alter table public.audit_logs enable row level security;

create policy "admins read audit logs" on public.audit_logs for select to authenticated
  using (public.is_admin());

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
-- The server writes view/download/login entries with the secret key.
grant select, insert on public.audit_logs to service_role;
revoke update, delete, truncate on public.audit_logs from service_role;

-- Append-only: no edits, no deletes (except the retention job below).
create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('medlife.audit_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'Audit logs cannot be changed or deleted' using errcode = '42501';
end;
$$;

drop trigger if exists audit_logs_no_change on public.audit_logs;
create trigger audit_logs_no_change
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();
drop trigger if exists audit_logs_no_truncate on public.audit_logs;
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable();

-- -----------------------------------------------------------------------------
-- audit_write(): used by the triggers below. Never breaks the caller.
-- -----------------------------------------------------------------------------
create or replace function public.audit_write(
  p_category    text,
  p_action      text,
  p_target_type text default null,
  p_target_id   text default null,
  p_patient     uuid default null,
  p_metadata    jsonb default '{}'::jsonb,
  p_success     boolean default true,
  p_throttle    interval default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me      uuid := auth.uid();
  hdrs    jsonb;
  v_role  text;
  v_label text;
begin
  -- Noisy events (autosaved notes, draft edits): one entry per window.
  if p_throttle is not null and exists (
    select 1 from public.audit_logs l
     where l.actor_id is not distinct from me
       and l.action = p_action
       and l.target_id is not distinct from p_target_id
       and l.occurred_at > now() - p_throttle
  ) then
    return;
  end if;

  begin
    hdrs := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    hdrs := null;
  end;

  if me is not null then
    select u.role, coalesce(nullif(u.full_name, ''), u.email) into v_role, v_label from public.users u where u.id = me;
  else
    v_role := 'system';
  end if;

  insert into public.audit_logs
    (actor_id, actor_role, actor_label, category, action, target_type, target_id, patient_id, success, ip, user_agent, metadata)
  values
    (me, v_role, left(v_label, 200), p_category, p_action, p_target_type, left(p_target_id, 80), p_patient,
     coalesce(p_success, true), left(hdrs ->> 'x-medlife-ip', 64), left(hdrs ->> 'x-medlife-ua', 300), coalesce(p_metadata, '{}'::jsonb));
exception when others then
  raise warning 'audit_write failed: %', sqlerrm;
end;
$$;

revoke execute on function public.audit_write(text, text, text, text, uuid, jsonb, boolean, interval) from public, anon, authenticated;

-- Keys whose values differ between two row images.
create or replace function public.audit_changed_keys(p_old jsonb, p_new jsonb, p_ignore text[] default '{}')
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
    from jsonb_object_keys(p_new) k
   where not (k = any (p_ignore))
     and (p_new -> k) is distinct from (p_old -> k);
$$;

-- -----------------------------------------------------------------------------
-- Medical data: health profile, reports, consultation notes/files, advice
-- -----------------------------------------------------------------------------
create or replace function public.audit_medical_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'patient_profiles' then
    perform public.audit_write('medical',
      case when tg_op = 'INSERT' then 'health_profile.create' else 'health_profile.update' end,
      'health_profile', new.user_id::text, new.user_id,
      case when tg_op = 'UPDATE'
        then jsonb_build_object('fields', public.audit_changed_keys(to_jsonb(old), to_jsonb(new), array['updated_at', 'created_at']))
        else '{}'::jsonb end);

  elsif tg_table_name = 'medical_files' then
    if tg_op = 'DELETE' then
      perform public.audit_write('medical', 'medical_file.delete', 'medical_file', old.id::text, old.patient_id,
        jsonb_build_object('title', old.title, 'type', old.category));
    elsif tg_op = 'INSERT' then
      perform public.audit_write('medical', 'medical_file.upload', 'medical_file', new.id::text, new.patient_id,
        jsonb_build_object('title', new.title, 'type', new.category, 'bytes', new.size_bytes));
    else
      perform public.audit_write('medical', 'medical_file.update', 'medical_file', new.id::text, new.patient_id,
        jsonb_build_object('fields', public.audit_changed_keys(to_jsonb(old), to_jsonb(new))));
    end if;

  elsif tg_table_name = 'consultations' then
    if new.notes is distinct from old.notes then
      perform public.audit_write('medical', 'consult_notes.update', 'consultation', new.appointment_id::text, new.patient_id,
        '{}'::jsonb, true, interval '10 minutes');
    end if;

  elsif tg_table_name = 'consultation_messages' then
    if new.kind = 'file' then
      perform public.audit_write('medical', 'consult_file.share', 'consultation_file', new.id::text,
        (select a.patient_id from public.appointments a where a.id = new.appointment_id),
        jsonb_build_object('file', new.file_name, 'appointment', new.appointment_id));
    end if;

  elsif tg_table_name = 'doctor_advice' then
    perform public.audit_write('medical', 'advice.create', 'advice', new.id::text, new.patient_id,
      jsonb_build_object('appointment', new.appointment_id));
  end if;
  return null;
end;
$$;

drop trigger if exists audit_patient_profiles on public.patient_profiles;
create trigger audit_patient_profiles after insert or update on public.patient_profiles
  for each row execute function public.audit_medical_change();
drop trigger if exists audit_medical_files on public.medical_files;
create trigger audit_medical_files after insert or update or delete on public.medical_files
  for each row execute function public.audit_medical_change();
drop trigger if exists audit_consultation_notes on public.consultations;
create trigger audit_consultation_notes after update of notes on public.consultations
  for each row execute function public.audit_medical_change();
drop trigger if exists audit_consultation_files on public.consultation_messages;
create trigger audit_consultation_files after insert on public.consultation_messages
  for each row execute function public.audit_medical_change();
drop trigger if exists audit_doctor_advice on public.doctor_advice;
create trigger audit_doctor_advice after insert on public.doctor_advice
  for each row execute function public.audit_medical_change();

-- -----------------------------------------------------------------------------
-- Prescriptions: create, edit (throttled), sign, replace, delete draft
-- -----------------------------------------------------------------------------
create or replace function public.audit_prescription_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write('prescription', case when new.parent_id is null then 'prescription.create' else 'prescription.amend' end,
      'prescription', new.id::text, new.patient_id,
      jsonb_build_object('version', new.version, 'manual_patient', new.patient_id is null, 'appointment', new.appointment_id));
  elsif tg_op = 'DELETE' then
    perform public.audit_write('prescription', 'prescription.delete_draft', 'prescription', old.id::text, old.patient_id,
      jsonb_build_object('version', old.version));
  elsif old.status = 'draft' and new.status = 'signed' then
    perform public.audit_write('prescription', 'prescription.sign', 'prescription', new.id::text, new.patient_id,
      jsonb_build_object('code', new.verify_code, 'version', new.version, 'online', new.is_online));
  elsif old.status = 'signed' and new.status = 'superseded' then
    perform public.audit_write('prescription', 'prescription.replace', 'prescription', new.id::text, new.patient_id,
      jsonb_build_object('code', new.verify_code, 'version', new.version));
  elsif new.status = 'draft' then
    perform public.audit_write('prescription', 'prescription.edit', 'prescription', new.id::text, new.patient_id,
      '{}'::jsonb, true, interval '10 minutes');
  end if;
  return null;
end;
$$;

drop trigger if exists audit_prescriptions on public.prescriptions;
create trigger audit_prescriptions after insert or update or delete on public.prescriptions
  for each row execute function public.audit_prescription_change();

-- -----------------------------------------------------------------------------
-- Verification documents and decisions
-- -----------------------------------------------------------------------------
create or replace function public.audit_verification_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'verification_documents' then
    if tg_op = 'INSERT' then
      perform public.audit_write('verification', 'verification_doc.upload', 'verification_document', new.id::text, null,
        jsonb_build_object('doctor', new.doctor_id, 'type', new.doc_type));
    else
      perform public.audit_write('verification', 'verification_doc.delete', 'verification_document', old.id::text, null,
        jsonb_build_object('doctor', old.doctor_id, 'type', old.doc_type));
    end if;
    return null;
  end if;

  -- verification_events
  perform public.audit_write('verification', 'verification.' || new.action, 'doctor',
    (select r.doctor_id::text from public.verification_requests r where r.id = new.request_id), null,
    jsonb_strip_nulls(jsonb_build_object('reason', new.reason)));
  return null;
end;
$$;

drop trigger if exists audit_verification_documents on public.verification_documents;
create trigger audit_verification_documents after insert or delete on public.verification_documents
  for each row execute function public.audit_verification_change();
drop trigger if exists audit_verification_events on public.verification_events;
create trigger audit_verification_events after insert on public.verification_events
  for each row execute function public.audit_verification_change();

-- -----------------------------------------------------------------------------
-- Accounts: sign-up, suspension, role changes
-- -----------------------------------------------------------------------------
create or replace function public.audit_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write('security', 'account.signup', 'user', new.id::text, null,
      jsonb_build_object('role', new.role, 'email', new.email));
    return null;
  end if;
  if new.status is distinct from old.status then
    perform public.audit_write('security',
      case when new.status::text = 'suspended' then 'account.suspend' else 'account.reactivate' end,
      'user', new.id::text, null,
      jsonb_strip_nulls(jsonb_build_object('reason', new.suspended_reason, 'role', new.role)));
  end if;
  if new.role is distinct from old.role then
    perform public.audit_write('security', 'account.role_change', 'user', new.id::text, null,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return null;
end;
$$;

drop trigger if exists audit_users on public.users;
create trigger audit_users after insert or update of status, role on public.users
  for each row execute function public.audit_user_change();

-- -----------------------------------------------------------------------------
-- Admin actions: settings, payouts, refunds, review moderation, medicines
-- -----------------------------------------------------------------------------
create or replace function public.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  diff jsonb;
begin
  if tg_table_name = 'platform_settings' then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('from', to_jsonb(old) -> k, 'to', to_jsonb(new) -> k)), '{}'::jsonb)
      into diff
      from jsonb_object_keys(to_jsonb(new)) k
     where k not in ('updated_at', 'updated_by')
       and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k);
    if diff <> '{}'::jsonb then
      perform public.audit_write('admin', 'settings.update', 'platform_settings', null, null, diff);
    end if;

  elsif tg_table_name = 'payouts' then
    perform public.audit_write('admin', 'payout.record', 'payout', new.id::text, null,
      jsonb_build_object('doctor', new.doctor_id, 'amount', new.amount, 'method', new.method));

  elsif tg_table_name = 'refunds' then
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      perform public.audit_write('admin', 'refund.' || new.status, 'refund', new.id::text,
        (select a.patient_id from public.appointments a where a.id = new.appointment_id),
        jsonb_strip_nulls(jsonb_build_object('amount', new.amount, 'appointment', new.appointment_id, 'error', left(new.error, 200))));
    end if;

  elsif tg_table_name = 'review_moderation_log' then
    if new.action in ('hidden', 'restored', 'dismissed') then
      perform public.audit_write('admin', 'review.' || new.action, 'review', new.review_id::text, null,
        jsonb_strip_nulls(jsonb_build_object('reason', new.reason)));
    end if;

  elsif tg_table_name = 'medicines' then
    -- Doctors' own custom medicines aren't admin actions.
    if public.is_admin() then
      perform public.audit_write('admin', 'medicine.update', 'medicine', new.id::text, null,
        jsonb_build_object('name', new.generic_name, 'fields', public.audit_changed_keys(to_jsonb(old), to_jsonb(new))));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists audit_platform_settings on public.platform_settings;
create trigger audit_platform_settings after update on public.platform_settings
  for each row execute function public.audit_admin_change();
drop trigger if exists audit_payouts on public.payouts;
create trigger audit_payouts after insert on public.payouts
  for each row execute function public.audit_admin_change();
drop trigger if exists audit_refunds on public.refunds;
create trigger audit_refunds after insert or update of status on public.refunds
  for each row execute function public.audit_admin_change();
drop trigger if exists audit_review_moderation on public.review_moderation_log;
create trigger audit_review_moderation after insert on public.review_moderation_log
  for each row execute function public.audit_admin_change();
drop trigger if exists audit_medicines_update on public.medicines;
create trigger audit_medicines_update after update on public.medicines
  for each row execute function public.audit_admin_change();

-- Medicine additions (one entry per statement, so a CSV import is one line).
create or replace function public.audit_medicines_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n     integer;
  first text;
begin
  if not public.is_admin() then
    return null;
  end if;
  select count(*), min(generic_name) into n, first from added;
  if n > 0 then
    perform public.audit_write('admin', case when n = 1 then 'medicine.add' else 'medicine.import' end, 'medicine', null, null,
      jsonb_build_object('count', n, 'first', first));
  end if;
  return null;
end;
$$;

drop trigger if exists audit_medicines_insert on public.medicines;
create trigger audit_medicines_insert after insert on public.medicines
  referencing new table as added
  for each statement execute function public.audit_medicines_added();

-- -----------------------------------------------------------------------------
-- Patients: who accessed my records (names only, no IPs)
-- -----------------------------------------------------------------------------
create or replace function public.my_record_access(p_limit integer default 50, p_offset integer default 0)
returns table (
  occurred_at timestamptz,
  action      text,
  category    text,
  actor_label text,
  actor_role  text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.occurred_at, l.action, l.category,
         case
           when l.actor_role = 'doctor' then coalesce(
             (select d.display_name from public.doctor_profiles d where d.user_id = l.actor_id), l.actor_label, 'A doctor')
           when l.actor_role = 'admin' then 'MedLife admin'
           when l.actor_id is null then 'MedLife (automatic)'
           else 'Another user'
         end,
         l.actor_role,
         count(*) over ()
    from public.audit_logs l
   where l.patient_id = auth.uid()
     and l.actor_id is distinct from auth.uid()
     and l.category in ('medical', 'prescription')
   order by l.occurred_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.my_record_access(integer, integer) from public, anon;
grant execute on function public.my_record_access(integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Retention: keep 2 years (minimum 180 days), purge nightly.
-- -----------------------------------------------------------------------------
create or replace function public.purge_audit_logs(p_keep_days integer default 730)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform set_config('medlife.audit_purge', 'on', true);
  delete from public.audit_logs where occurred_at < now() - make_interval(days => greatest(coalesce(p_keep_days, 730), 180));
  get diagnostics n = row_count;
  perform set_config('medlife.audit_purge', 'off', true);
  if n > 0 then
    perform public.audit_write('admin', 'audit.purge', 'audit_logs', null, null,
      jsonb_build_object('deleted', n, 'keep_days', greatest(coalesce(p_keep_days, 730), 180)));
  end if;
  return n;
end;
$$;

revoke execute on function public.purge_audit_logs(integer) from public, anon, authenticated;

do $$
begin
  perform cron.schedule('medlife-audit-purge', '30 21 * * *', 'select public.purge_audit_logs()');  -- 03:30 Dhaka
exception when others then
  raise warning 'Audit purge not scheduled (%). Enable pg_cron, then run: select cron.schedule(''medlife-audit-purge'', ''30 21 * * *'', ''select public.purge_audit_logs()'');', sqlerrm;
end;
$$;
