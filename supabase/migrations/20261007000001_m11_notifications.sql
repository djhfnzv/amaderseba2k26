-- =============================================================================
-- M11. Notifications: in-app (live bell) + SMS (BulkSMSBD)
-- Tables: notifications, notification_preferences, sms_verifications, sms_outbox
-- Functions: notify (internal), mark_notifications_read,
--            queue_appointment_reminders, claim_sms, run_notification_jobs
--
-- * Notifications are created by DB triggers on the events that already exist
--   (appointment_events, prescriptions, doctor_advice, verification_events),
--   so every path (app, payment callbacks, admin actions) is covered.
-- * SMS goes to a verified mobile number the user adds in their notification
--   settings. Messages are queued in sms_outbox and sent by the app
--   (/api/cron/notifications); failures are retried.
-- * Reminders 24 h and 1 h before appointments (FR-P-07) are queued by
--   pg_cron every minute.
-- Requires: M1-M10.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- notifications (in-app)
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  kind       text not null check (char_length(kind) between 1 and 40),
  title      text not null check (char_length(title) between 1 and 200),
  body       text check (char_length(body) <= 1000),
  link       text check (link is null or (link like '/%' and link not like '//%' and char_length(link) <= 300)),
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create unique index if not exists notifications_dedupe on public.notifications (dedupe_key) where dedupe_key is not null;

alter table public.notifications enable row level security;
create policy "users read own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid());

-- Created only by triggers/functions; marked read via mark_notifications_read().
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;

-- Live bell updates (Realtime respects the select policy above).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when undefined_object then
  raise notice 'supabase_realtime publication not found; the bell will refresh on navigation only';
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language sql
security definer
set search_path = ''
as $$
  with done as (
    update public.notifications
       set read_at = now()
     where user_id = auth.uid()
       and read_at is null
       and (p_ids is null or id = any (p_ids))
    returning 1
  )
  select count(*)::integer from done;
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- SMS settings, phone verification and outbox
-- -----------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id               uuid primary key references public.users (id) on delete cascade,
  sms_enabled           boolean not null default true,
  sms_phone             text check (sms_phone ~ '^8801[3-9][0-9]{8}$'),
  sms_phone_verified_at timestamptz,
  updated_at            timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
create policy "users read own preferences" on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());
create policy "admins read preferences" on public.notification_preferences for select to authenticated
  using (public.is_admin());
-- Written by the server only (phone must be verified first).
revoke all on public.notification_preferences from anon;
revoke insert, update, delete on public.notification_preferences from authenticated;
grant select on public.notification_preferences to authenticated;

-- One-time codes for confirming a phone number. Server-only.
create table if not exists public.sms_verifications (
  user_id           uuid primary key references public.users (id) on delete cascade,
  phone             text not null check (phone ~ '^8801[3-9][0-9]{8}$'),
  code_hash         text not null,
  expires_at        timestamptz not null,
  attempts          integer not null default 0,
  sends_in_window   integer not null default 0,
  window_started_at timestamptz not null default now(),
  last_sent_at      timestamptz not null default now()
);

alter table public.sms_verifications enable row level security;
revoke all on public.sms_verifications from anon, authenticated;

create table if not exists public.sms_outbox (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users (id) on delete cascade,
  notification_id uuid references public.notifications (id) on delete set null,
  phone           text not null check (phone ~ '^8801[3-9][0-9]{8}$'),
  body            text not null check (char_length(body) between 1 and 480),
  status          text not null default 'pending'
                  check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts        integer not null default 0,
  provider        text,
  provider_ref    text,
  error           text check (char_length(error) <= 500),
  not_before      timestamptz not null default now(),
  expires_at      timestamptz,
  claimed_at      timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists sms_outbox_queue_idx on public.sms_outbox (not_before) where status in ('pending', 'sending');
create index if not exists sms_outbox_created_idx on public.sms_outbox (created_at desc);

alter table public.sms_outbox enable row level security;
create policy "admins read sms outbox" on public.sms_outbox for select to authenticated
  using (public.is_admin());
revoke all on public.sms_outbox from anon;
revoke insert, update, delete on public.sms_outbox from authenticated;
grant select on public.sms_outbox to authenticated;

-- Hand a batch of due messages to one sender (safe with parallel senders).
create or replace function public.claim_sms(p_limit integer default 20)
returns setof public.sms_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Too late to be useful (e.g. a reminder after the appointment started).
  update public.sms_outbox
     set status = 'cancelled', error = 'Expired before it could be sent'
   where status = 'pending' and expires_at is not null and expires_at < now();
  -- A sender that crashed mid-send: try again.
  update public.sms_outbox
     set status = 'pending'
   where status = 'sending' and claimed_at < now() - interval '10 minutes';

  return query
  with claimed as (
    update public.sms_outbox o
       set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
     where o.id in (
       select x.id from public.sms_outbox x
        where x.status = 'pending' and x.not_before <= now()
        order by x.created_at
        for update skip locked
        limit greatest(1, least(p_limit, 100))
     )
    returning o.*
  )
  select * from claimed;
end;
$$;

revoke execute on function public.claim_sms(integer) from public, anon, authenticated;
grant execute on function public.claim_sms(integer) to service_role;

-- -----------------------------------------------------------------------------
-- notify(): one in-app notification (+ optional SMS). Internal only.
-- -----------------------------------------------------------------------------
create or replace function public.notify(
  p_user        uuid,
  p_kind        text,
  p_title       text,
  p_body        text default null,
  p_link        text default null,
  p_sms         text default null,
  p_dedupe      text default null,
  p_sms_expires timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  nid  uuid;
  pref public.notification_preferences;
begin
  if p_user is null then
    return null;
  end if;

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (p_user, p_kind, left(p_title, 200), left(p_body, 1000), p_link, p_dedupe)
  on conflict do nothing
  returning id into nid;
  if nid is null then
    return null; -- already sent
  end if;

  if p_sms is not null then
    select * into pref from public.notification_preferences where user_id = p_user;
    if found and pref.sms_enabled and pref.sms_phone is not null and pref.sms_phone_verified_at is not null
       and exists (select 1 from public.users u where u.id = p_user and u.status = 'active') then
      insert into public.sms_outbox (user_id, notification_id, phone, body, expires_at)
      values (p_user, nid, pref.sms_phone, left('MedLife: ' || p_sms, 480),
              coalesce(p_sms_expires, now() + interval '12 hours'));
    end if;
  end if;
  return nid;
end;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;

-- "5 Oct, 4:30 PM" in the doctor's time zone.
create or replace function public.slot_label(p_at timestamptz, p_tz text)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_at at time zone coalesce(p_tz, 'Asia/Dhaka'), 'FMDD Mon, FMHH12:MI AM');
$$;

-- -----------------------------------------------------------------------------
-- Appointment events -> notifications
-- -----------------------------------------------------------------------------
create or replace function public.notify_appointment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a        public.appointments;
  doc_name text;
  tz       text;
  pat_name text;
  at_label text;
  kind_txt text;
  p_link   text;
  d_link   text;
  by_patient boolean;
  by_doctor  boolean;
  reason   text;
begin
  select * into a from public.appointments where id = new.appointment_id;
  if not found then
    return new;
  end if;
  select d.display_name, d.timezone into doc_name, tz from public.doctor_profiles d where d.user_id = a.doctor_id;
  select coalesce(nullif(u.full_name, ''), u.email, 'A patient') into pat_name from public.users u where u.id = a.patient_id;
  doc_name := coalesce(doc_name, 'your doctor');
  at_label := public.slot_label(a.slot_start, tz);
  kind_txt := case a.consultation_type when 'online' then 'online consultation' else 'visit' end;
  p_link := '/patient/appointments/' || a.id;
  d_link := '/doctor/appointments/' || a.id;
  by_patient := new.actor_id is not null and new.actor_id = a.patient_id;
  by_doctor := new.actor_id is not null and new.actor_id = a.doctor_id;
  reason := case when nullif(trim(coalesce(new.note, '')), '') is not null then ' Reason: ' || new.note else '' end;

  case new.action
  when 'booked', 'payment_received' then
    if a.status = 'confirmed' then
      perform public.notify(a.patient_id, 'appointment_confirmed',
        case new.action when 'payment_received' then 'Payment received — appointment confirmed' else 'Appointment confirmed' end,
        format('Your %s with %s is on %s.', kind_txt, doc_name, at_label), p_link,
        format('Your appointment with %s is confirmed for %s.', doc_name, at_label),
        'confirmed:' || a.id, a.slot_start);
      perform public.notify(a.doctor_id, 'appointment_new', 'New appointment',
        format('%s booked a %s on %s.', pat_name, kind_txt, at_label), d_link,
        format('New %s booked for %s.', kind_txt, at_label),
        'new:' || a.id, a.slot_start);
    elsif new.action = 'booked' and a.status = 'pending_payment' then
      perform public.notify(a.patient_id, 'payment_due', 'Complete your payment',
        format('Pay by %s to keep your %s with %s on %s.',
               public.slot_label(a.payment_due_at, tz), kind_txt, doc_name, at_label),
        p_link, null, 'due:' || a.id);
    elsif new.action = 'payment_received' then
      perform public.notify(a.patient_id, 'payment_refund_due', 'Payment received after the booking closed',
        'Your slot was no longer available, so a full refund has been started.', p_link,
        format('Your payment for %s arrived after the booking closed. A full refund has been started.', doc_name),
        'late:' || new.id);
    end if;

  when 'cancelled' then
    if not by_patient then
      perform public.notify(a.patient_id, 'appointment_cancelled', 'Appointment cancelled',
        format('Your %s with %s on %s was cancelled.%s', kind_txt, doc_name, at_label, reason), p_link,
        format('Your appointment with %s on %s was cancelled. Details in your MedLife account.', doc_name, at_label),
        'cancel:p:' || new.id);
    end if;
    if not by_doctor then
      perform public.notify(a.doctor_id, 'appointment_cancelled', 'Appointment cancelled',
        format('%s''s %s on %s was cancelled.%s', pat_name, kind_txt, at_label, reason), d_link,
        null, 'cancel:d:' || new.id);
    end if;

  when 'rescheduled' then
    if not by_patient then
      perform public.notify(a.patient_id, 'appointment_rescheduled', 'Appointment moved',
        format('Your %s with %s is now on %s.', kind_txt, doc_name, at_label), p_link,
        format('Your appointment with %s has been moved to %s.', doc_name, at_label),
        'resched:p:' || new.id, a.slot_start);
    end if;
    if not by_doctor then
      perform public.notify(a.doctor_id, 'appointment_rescheduled', 'Appointment moved',
        format('%s moved their %s to %s.', pat_name, kind_txt, at_label), d_link,
        null, 'resched:d:' || new.id);
    end if;

  when 'started' then
    if a.consultation_type = 'online' then
      perform public.notify(a.patient_id, 'consult_started', 'Your doctor is ready',
        format('%s has started your online consultation. Join now.', doc_name), '/consult/' || a.id,
        format('%s has started your online consultation. Join now from your MedLife account.', doc_name),
        'started:' || a.id, a.slot_end + interval '30 minutes');
    end if;

  when 'no_show' then
    perform public.notify(a.patient_id, 'appointment_missed', 'Appointment missed',
      format('Your %s with %s on %s was marked as missed.', kind_txt, doc_name, at_label), p_link,
      null, 'noshow:' || a.id);

  when 'expired' then
    perform public.notify(a.patient_id, 'appointment_expired', 'Booking expired',
      format('Payment for your %s with %s on %s wasn''t completed in time, so the slot was released.',
             kind_txt, doc_name, at_label), p_link,
      null, 'expired:' || new.id);

  when 'refunded' then
    perform public.notify(a.patient_id, 'refund_issued', 'Refund issued',
      format('%s for your %s with %s.', coalesce(new.note, 'A refund was issued'), kind_txt, doc_name), p_link,
      format('%s for your appointment with %s.', coalesce(new.note, 'A refund was issued'), doc_name),
      'refund:' || new.id);

  else
    null;
  end case;
  return new;
exception when others then
  -- A notification problem must never block the booking action itself.
  raise warning 'notify_appointment_event failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists appointment_events_notify on public.appointment_events;
create trigger appointment_events_notify
  after insert on public.appointment_events
  for each row execute function public.notify_appointment_event();

-- -----------------------------------------------------------------------------
-- Prescriptions and advice -> patient
-- -----------------------------------------------------------------------------
create or replace function public.notify_prescription_signed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc text := coalesce(new.doctor_name, 'Your doctor');
begin
  if new.patient_id is not null and old.status = 'draft' and new.status = 'signed' then
    perform public.notify(new.patient_id, 'prescription',
      case when new.parent_id is null then 'New prescription' else 'Updated prescription' end,
      case when new.parent_id is null
        then format('%s has sent you a prescription.', doc)
        else format('%s has updated your prescription. Use the new version.', doc) end,
      '/patient/prescriptions/' || new.id,
      format('%s has sent you a prescription. View it in your MedLife account.', doc),
      'rx:' || new.id);
  end if;
  return new;
exception when others then
  raise warning 'notify_prescription_signed failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists prescriptions_notify on public.prescriptions;
create trigger prescriptions_notify
  after update of status on public.prescriptions
  for each row execute function public.notify_prescription_signed();

create or replace function public.notify_doctor_advice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc text;
begin
  select d.display_name into doc from public.doctor_profiles d where d.user_id = new.doctor_id;
  perform public.notify(new.patient_id, 'advice',
    format('Advice from %s', coalesce(doc, 'your doctor')),
    left(coalesce(nullif(new.title, ''), new.body), 160),
    case when new.appointment_id is not null then '/patient/appointments/' || new.appointment_id
         else '/patient/prescriptions' end,
    null, 'advice:' || new.id);
  return new;
exception when others then
  raise warning 'notify_doctor_advice failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists doctor_advice_notify on public.doctor_advice;
create trigger doctor_advice_notify
  after insert on public.doctor_advice
  for each row execute function public.notify_doctor_advice();

-- -----------------------------------------------------------------------------
-- Verification -> doctor (decision) / admins (new request)
-- -----------------------------------------------------------------------------
create or replace function public.notify_verification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        public.verification_requests;
  doc_name text;
  adm      uuid;
begin
  select * into r from public.verification_requests where id = new.request_id;
  if not found then
    return new;
  end if;
  select d.display_name into doc_name from public.doctor_profiles d where d.user_id = r.doctor_id;

  if new.action = 'submitted' then
    for adm in select u.id from public.users u where u.role = 'admin' and u.status = 'active' loop
      perform public.notify(adm, 'verification_request', 'New verification request',
        format('%s submitted documents for review.', coalesce(doc_name, 'A doctor')),
        '/admin/verifications/' || r.id, null, 'vreq:' || new.id || ':' || adm);
    end loop;
  elsif new.action = 'approved' then
    perform public.notify(r.doctor_id, 'verification', 'You''re verified',
      'Your profile is now public and patients can book you.', '/doctor/verification',
      'Your doctor account is verified. Your profile is now live and patients can book you.',
      'v:' || new.id);
  elsif new.action = 'rejected' then
    perform public.notify(r.doctor_id, 'verification', 'Verification needs changes',
      coalesce('Reason: ' || new.reason, 'Please check your documents and submit again.'), '/doctor/verification',
      'Your verification needs changes. Please check your MedLife account.',
      'v:' || new.id);
  elsif new.action = 'revoked' then
    perform public.notify(r.doctor_id, 'verification', 'Verification revoked',
      coalesce('Reason: ' || new.reason, 'Your profile is no longer public.'), '/doctor/verification',
      'Your MedLife verification was revoked. Please check your account.',
      'v:' || new.id);
  end if;
  return new;
exception when others then
  raise warning 'notify_verification_event failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists verification_events_notify on public.verification_events;
create trigger verification_events_notify
  after insert on public.verification_events
  for each row execute function public.notify_verification_event();

-- -----------------------------------------------------------------------------
-- Reminders 24 h and 1 h before (FR-P-07)
-- -----------------------------------------------------------------------------
create or replace function public.queue_appointment_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r     record;
  n     integer := 0;
  label text;
  where_txt text;
begin
  for r in
    select a.*, d.display_name as doc_name, d.timezone as tz, c.name as chamber_name
      from public.appointments a
      join public.doctor_profiles d on d.user_id = a.doctor_id
      left join public.doctor_chambers c on c.id = a.chamber_id
     where a.status = 'confirmed'
       and a.slot_start > now()
       and a.slot_start <= now() + interval '24 hours'
  loop
    label := public.slot_label(r.slot_start, r.tz);
    where_txt := case when r.consultation_type = 'online'
                      then 'Join the video call from your MedLife account.'
                      else coalesce('At ' || r.chamber_name || '.', '') end;

    if r.slot_start <= now() + interval '60 minutes' then
      -- 1 hour before (skip if it was booked less than 90 min ahead).
      if r.created_at <= r.slot_start - interval '90 minutes' then
        if public.notify(r.patient_id, 'reminder', 'Starting in about an hour',
             format('Your %s with %s starts at %s. %s',
                    case r.consultation_type when 'online' then 'online consultation' else 'visit' end,
                    coalesce(r.doc_name, 'your doctor'), label, where_txt),
             case when r.consultation_type = 'online' then '/consult/' || r.id else '/patient/appointments/' || r.id end,
             format('Reminder: your appointment with %s starts at %s. %s', coalesce(r.doc_name, 'your doctor'), label, where_txt),
             'remind1h:' || r.id, r.slot_start) is not null then
          n := n + 1;
        end if;
      end if;
    elsif r.slot_start > now() + interval '12 hours' and r.created_at <= r.slot_start - interval '20 hours' then
      -- About 24 hours before (only if booked well in advance).
      if public.notify(r.patient_id, 'reminder', 'Upcoming appointment',
           format('Your %s with %s is on %s. %s',
                  case r.consultation_type when 'online' then 'online consultation' else 'visit' end,
                  coalesce(r.doc_name, 'your doctor'), label, where_txt),
           '/patient/appointments/' || r.id,
           format('Reminder: your appointment with %s is on %s. %s', coalesce(r.doc_name, 'your doctor'), label, where_txt),
           'remind24h:' || r.id, r.slot_start) is not null then
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end;
$$;

revoke execute on function public.queue_appointment_reminders() from public, anon, authenticated;
grant execute on function public.queue_appointment_reminders() to service_role;

-- -----------------------------------------------------------------------------
-- Scheduled job (every minute): expire unpaid bookings, queue reminders and
-- wake the SMS sender. The sender URL + secret live in Supabase Vault:
--   select vault.create_secret('https://<your-site>/api/cron/notifications', 'medlife_dispatch_url');
--   select vault.create_secret('<CRON_SECRET from .env>', 'medlife_cron_secret');
-- -----------------------------------------------------------------------------
create or replace function public.run_notification_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url    text;
  secret text;
begin
  perform public.expire_stale_payments(null);
  perform public.queue_appointment_reminders();

  if exists (select 1 from public.sms_outbox where status = 'pending' and not_before <= now()) then
    begin
      select s.decrypted_secret into url from vault.decrypted_secrets s where s.name = 'medlife_dispatch_url';
      select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'medlife_cron_secret';
      if url is not null and secret is not null then
        perform net.http_post(
          url := url,
          body := '{}'::jsonb,
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
          timeout_milliseconds := 15000
        );
      end if;
    exception when others then
      raise warning 'Could not wake the SMS sender: %', sqlerrm;
    end;
  end if;
end;
$$;

revoke execute on function public.run_notification_jobs() from public, anon, authenticated;
grant execute on function public.run_notification_jobs() to service_role;

do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('medlife-notifications', '* * * * *', 'select public.run_notification_jobs()');
exception when others then
  raise warning 'Scheduler not set up (%). Enable pg_cron and pg_net in Dashboard -> Database -> Extensions, then run: select cron.schedule(''medlife-notifications'', ''* * * * *'', ''select public.run_notification_jobs()'');', sqlerrm;
end $$;
