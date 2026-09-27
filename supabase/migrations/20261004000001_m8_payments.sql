-- =============================================================================
-- M8. Payments (SSLCommerz)
-- Tables: platform_settings, payments, refunds, payouts
-- Columns: appointments.payment_method, appointments.payment_due_at
--
-- Flow: slot hold -> confirm (choose pay online / at chamber)
--   * pay online -> appointment PENDING_PAYMENT for `payment_window_minutes`
--     -> begin_payment() creates a payment + tran_id -> gateway
--     -> gateway success -> server validates with SSLCommerz -> complete_payment()
--        -> CONFIRMED (payment_status 'paid', commission split recorded)
--     -> not paid in time -> EXPIRED, slot released
--   * pay at chamber (in-person only) -> CONFIRMED immediately (as in M7)
-- Refunds when a paid appointment is cancelled:
--   doctor/admin cancels -> 100%; patient >= refund_full_hours before -> 100%;
--   patient later (still >= 2h) -> refund_partial_percent.
-- Gateway-facing functions are callable by service_role only (server code
-- using the secret key after verifying the gateway response).
-- Requires: M1-M7, M13.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- platform_settings (single row, admin-editable)
-- -----------------------------------------------------------------------------
create table if not exists public.platform_settings (
  id                      smallint primary key default 1 check (id = 1),
  commission_percent      numeric(5, 2) not null default 10 check (commission_percent between 0 and 100),
  refund_full_hours       integer not null default 24 check (refund_full_hours between 2 and 720),
  refund_partial_percent  integer not null default 50 check (refund_partial_percent between 0 and 100),
  payment_window_minutes  integer not null default 15 check (payment_window_minutes between 5 and 60),
  currency                text not null default 'BDT' check (currency = 'BDT'),
  updated_by              uuid references public.users (id) on delete set null,
  updated_at              timestamptz not null default now()
);

insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists platform_settings_set_updated_at on public.platform_settings;
create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

create policy "settings are readable by everyone" on public.platform_settings for select
  using (true);
create policy "admins update settings" on public.platform_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.platform_settings from anon;
grant select on public.platform_settings to anon, authenticated;
grant update (commission_percent, refund_full_hours, refund_partial_percent, payment_window_minutes, updated_by)
  on public.platform_settings to authenticated;

-- -----------------------------------------------------------------------------
-- appointments: payment method + deadline; wider payment_status / events
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column if not exists payment_method text not null default 'at_chamber'
    check (payment_method in ('online', 'at_chamber')),
  add column if not exists payment_due_at timestamptz;

alter table public.appointments drop constraint if exists appointments_payment_status_check;
alter table public.appointments add constraint appointments_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'refunded', 'partially_refunded', 'waived'));

alter table public.appointment_events drop constraint if exists appointment_events_action_check;
alter table public.appointment_events add constraint appointment_events_action_check
  check (action in ('booked', 'cancelled', 'rescheduled', 'started', 'completed', 'no_show',
                    'payment_received', 'expired', 'refunded'));

-- -----------------------------------------------------------------------------
-- payments
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid not null references public.appointments (id) on delete cascade,
  patient_id        uuid not null references public.users (id) on delete cascade,
  doctor_id         uuid not null references public.doctor_profiles (user_id) on delete cascade,
  provider          text not null check (provider in ('sslcommerz', 'mock')),
  tran_id           text not null unique,
  amount            numeric(10, 2) not null check (amount > 0),
  currency          text not null default 'BDT',
  status            text not null default 'initiated'
                    check (status in ('initiated', 'paid', 'failed', 'cancelled', 'expired')),
  val_id            text,
  bank_tran_id      text,
  card_type         text,
  commission_amount numeric(10, 2),
  doctor_amount     numeric(10, 2),
  gateway_data      jsonb not null default '{}'::jsonb,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists payments_appointment_idx on public.payments (appointment_id);
create index if not exists payments_doctor_idx on public.payments (doctor_id, paid_at);
create index if not exists payments_status_idx on public.payments (status, created_at desc);
-- At most one successful payment per appointment.
create unique index if not exists payments_one_paid_per_appointment
  on public.payments (appointment_id) where status = 'paid';

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- refunds
-- -----------------------------------------------------------------------------
create table if not exists public.refunds (
  id             uuid primary key default gen_random_uuid(),
  payment_id     uuid not null references public.payments (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  amount         numeric(10, 2) not null check (amount >= 0),
  reason         text check (char_length(reason) <= 500),
  status         text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  provider_ref   text,
  error          text check (char_length(error) <= 1000),
  attempts       integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One active (non-failed) refund per payment.
create unique index if not exists refunds_one_active_per_payment
  on public.refunds (payment_id) where status <> 'failed';
create index if not exists refunds_status_idx on public.refunds (status, created_at desc);

drop trigger if exists refunds_set_updated_at on public.refunds;
create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- payouts (admin records transfers to doctors)
-- -----------------------------------------------------------------------------
create table if not exists public.payouts (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctor_profiles (user_id) on delete cascade,
  amount     numeric(10, 2) not null check (amount > 0),
  method     text not null check (method in ('bank', 'bkash', 'nagad', 'cash', 'other')),
  reference  text check (char_length(reference) <= 120),
  note       text check (char_length(note) <= 500),
  paid_at    timestamptz not null default now(),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payouts_doctor_idx on public.payouts (doctor_id, paid_at desc);

-- -----------------------------------------------------------------------------
-- RLS (reads only; all writes go through functions)
-- -----------------------------------------------------------------------------
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.payouts enable row level security;

create policy "patients read own payments" on public.payments for select to authenticated
  using (patient_id = auth.uid());
create policy "doctors read own payments" on public.payments for select to authenticated
  using (doctor_id = auth.uid());
create policy "admins read all payments" on public.payments for select to authenticated
  using (public.is_admin());

create policy "participants read refunds" on public.refunds for select to authenticated
  using (exists (
    select 1 from public.appointments a
    where a.id = appointment_id and (a.patient_id = auth.uid() or a.doctor_id = auth.uid())
  ) or public.is_admin());

create policy "doctors read own payouts" on public.payouts for select to authenticated
  using (doctor_id = auth.uid());
create policy "admins read all payouts" on public.payouts for select to authenticated
  using (public.is_admin());

revoke all on public.payments, public.refunds, public.payouts from anon;
revoke insert, update, delete on public.payments, public.refunds, public.payouts from authenticated;
grant select on public.payments, public.refunds, public.payouts to authenticated;
grant all on public.payments, public.refunds, public.payouts to service_role;

-- -----------------------------------------------------------------------------
-- Expire unpaid appointments whose payment window has passed
-- -----------------------------------------------------------------------------
create or replace function public.expire_stale_payments(p_doctor uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  with stale as (
    update public.appointments a
       set status = 'expired'
     where a.status = 'pending_payment'
       and a.payment_due_at is not null
       and a.payment_due_at < now()
       and (p_doctor is null or a.doctor_id = p_doctor)
    returning a.id
  ), logged as (
    insert into public.appointment_events (appointment_id, action, note)
    select id, 'expired', 'Payment was not completed in time' from stale
    returning appointment_id
  )
  select count(*) into n from logged;

  update public.payments p
     set status = 'expired'
   where p.status = 'initiated'
     and exists (select 1 from public.appointments a where a.id = p.appointment_id and a.status = 'expired');

  return n;
end;
$$;

revoke execute on function public.expire_stale_payments(uuid) from public, anon;
grant execute on function public.expire_stale_payments(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- get_available_slots(): an unpaid appointment only blocks its slot until its
-- payment deadline.
-- -----------------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_doctor uuid,
  p_from   date    default null,
  p_days   integer default 7,
  p_type   text    default null
)
returns table (
  slot_start           timestamptz,
  slot_end             timestamptz,
  consultation_type    text,
  chamber_id           uuid,
  consultation_minutes smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  slot_interval constant interval := interval '30 minutes';
  min_notice    constant interval := interval '2 hours';
  window_days   constant integer  := 30;
  tz     text;
  today  date;
  d_from date;
  d_to   date;
begin
  if not (public.doctor_is_public(p_doctor) or p_doctor = auth.uid() or public.is_admin()) then
    return;
  end if;

  select dp.timezone into tz from public.doctor_profiles dp where dp.user_id = p_doctor;
  if tz is null then
    return;
  end if;

  today  := (now() at time zone tz)::date;
  d_from := greatest(coalesce(p_from, today), today);
  d_to   := least(d_from + greatest(least(coalesce(p_days, 7), 31), 1) - 1, today + window_days - 1);
  if d_to < d_from then
    return;
  end if;

  return query
  with days as (
    select gs::date as d
    from generate_series(d_from::timestamp, d_to::timestamp, interval '1 day') gs
  ),
  raw as (
    select
      dd.d,
      (dd.d + b.start_time) + (n * slot_interval) as local_start,
      b.consultation_minutes as minutes,
      b.consultation_type as ctype,
      b.chamber_id as chamber
    from days dd
    join public.doctor_availability b
      on b.doctor_id = p_doctor
     and b.is_active
     and b.weekday = extract(dow from dd.d)::int
    cross join lateral generate_series(
      0,
      floor(
        extract(epoch from (b.end_time - b.start_time - make_interval(mins => b.consultation_minutes)))
        / extract(epoch from slot_interval)
      )::int
    ) as n
    where p_type is null or b.consultation_type = p_type
  ),
  slots as (
    select
      r.*,
      r.local_start at time zone tz as s_start,
      (r.local_start + make_interval(mins => r.minutes)) at time zone tz as s_end
    from raw r
  )
  select s.s_start, s.s_end, s.ctype, s.chamber, s.minutes
  from slots s
  where s.s_start >= now() + min_notice
    and not exists (
      select 1 from public.doctor_leaves l
      where l.doctor_id = p_doctor
        and s.d between l.start_date and l.end_date
        and (
          l.start_time is null
          or (s.local_start::time < l.end_time
              and (s.local_start + make_interval(mins => s.minutes))::time > l.start_time)
        )
    )
    and not exists (
      select 1 from public.appointments a
      where a.doctor_id = p_doctor
        and (
          a.status in ('confirmed', 'in_progress')
          or (a.status = 'pending_payment' and coalesce(a.payment_due_at, 'infinity') > now())
        )
        and a.slot_start < s.s_end
        and s.s_start < a.slot_end
    )
    and not exists (
      select 1 from public.slot_holds h
      where h.doctor_id = p_doctor
        and h.expires_at > now()
        and h.patient_id is distinct from auth.uid()
        and h.slot_start < s.s_end
        and s.s_start < h.slot_end
    )
  order by 1, 3;
end;
$$;

-- -----------------------------------------------------------------------------
-- hold_slot(): expire stale unpaid bookings first
-- -----------------------------------------------------------------------------
create or replace function public.hold_slot(p_doctor uuid, p_slot_start timestamptz, p_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_active_patient();
  tz text;
  s record;
  hold_id uuid;
begin
  if not public.doctor_is_public(p_doctor) then
    raise exception 'This doctor is not accepting bookings' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_doctor::text, 0));
  perform public.expire_stale_payments(p_doctor);

  delete from public.slot_holds h where h.expires_at <= now() or h.patient_id = me;

  if exists (
    select 1 from public.appointments a
    where a.patient_id = me and a.doctor_id = p_doctor
      and a.status in ('pending_payment', 'confirmed') and a.slot_start > now()
  ) then
    raise exception 'You already have an upcoming appointment with this doctor' using errcode = '22023';
  end if;

  select dp.timezone into tz from public.doctor_profiles dp where dp.user_id = p_doctor;

  select g.* into s
  from public.get_available_slots(p_doctor, (p_slot_start at time zone tz)::date, 1, p_type) g
  where g.slot_start = p_slot_start
  limit 1;
  if not found then
    raise exception 'That slot is no longer available. Please pick another time.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.patient_id = me
      and a.status in ('pending_payment', 'confirmed', 'in_progress')
      and a.slot_start < s.slot_end and s.slot_start < a.slot_end
  ) then
    raise exception 'You already have another appointment at that time' using errcode = '22023';
  end if;

  insert into public.slot_holds (doctor_id, patient_id, slot_start, slot_end, consultation_type, chamber_id, expires_at)
  values (p_doctor, me, s.slot_start, s.slot_end, s.consultation_type, s.chamber_id, now() + interval '5 minutes')
  returning id into hold_id;

  return hold_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- confirm_booking(): now chooses between paying online and at the chamber
-- -----------------------------------------------------------------------------
drop function if exists public.confirm_booking(uuid, text);

create or replace function public.confirm_booking(
  p_hold           uuid,
  p_note           text    default null,
  p_pay_at_chamber boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_active_patient();
  h public.slot_holds;
  appt_id uuid;
  fee numeric;
  pay_online boolean;
  window_min integer;
begin
  select * into h from public.slot_holds where id = p_hold and patient_id = me for update;
  if not found or h.expires_at <= now() then
    delete from public.slot_holds where id = p_hold and patient_id = me;
    raise exception 'Your 5-minute hold has expired. Please pick the slot again.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(h.doctor_id::text, 0));
  perform public.expire_stale_payments(h.doctor_id);

  if exists (
    select 1 from public.appointments a
    where a.patient_id = me and a.doctor_id = h.doctor_id
      and a.status in ('pending_payment', 'confirmed') and a.slot_start > now()
  ) then
    raise exception 'You already have an upcoming appointment with this doctor' using errcode = '22023';
  end if;

  select case h.consultation_type when 'online' then dp.fee_online else dp.fee_in_person end
    into fee
  from public.doctor_profiles dp where dp.user_id = h.doctor_id;

  -- Online consultations must be paid online; in-person may be paid at the chamber.
  pay_online := h.consultation_type = 'online' or not coalesce(p_pay_at_chamber, false);
  if pay_online and coalesce(fee, 0) <= 0 then
    pay_online := false; -- nothing to charge
  end if;

  select s.payment_window_minutes into window_min from public.platform_settings s where s.id = 1;

  begin
    insert into public.appointments (
      patient_id, doctor_id, slot_start, slot_end, consultation_type, chamber_id,
      status, fee, patient_note, payment_method, payment_due_at
    ) values (
      me, h.doctor_id, h.slot_start, h.slot_end, h.consultation_type, h.chamber_id,
      case when pay_online then 'pending_payment' else 'confirmed' end,
      fee, nullif(trim(coalesce(p_note, '')), ''),
      case when pay_online then 'online' else 'at_chamber' end,
      case when pay_online then now() + make_interval(mins => coalesce(window_min, 15)) end
    )
    returning id into appt_id;
  exception when unique_violation then
    raise exception 'That slot was just taken. Please pick another time.' using errcode = '22023';
  end;

  insert into public.appointment_events (appointment_id, action, actor_id, note)
  values (appt_id, 'booked', me, case when pay_online then 'Awaiting online payment' end);

  delete from public.slot_holds where id = h.id;
  return appt_id;
end;
$$;

revoke execute on function public.confirm_booking(uuid, text, boolean) from public, anon;
grant execute on function public.confirm_booking(uuid, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- cancel_appointment(): also closes any unfinished payment attempts
-- (refunds for paid appointments are issued by the server afterwards)
-- -----------------------------------------------------------------------------
create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  a public.appointments;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into a from public.appointments where id = p_id for update;
  if not found then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;
  if a.status not in ('pending_payment', 'confirmed') then
    raise exception 'This appointment can no longer be cancelled' using errcode = '22023';
  end if;

  if a.patient_id = me then
    if a.status = 'confirmed' and a.slot_start - now() < interval '2 hours' then
      raise exception 'Appointments can be cancelled up to 2 hours before the start time' using errcode = '22023';
    end if;
  elsif a.doctor_id = me or public.is_admin() then
    if reason is null or char_length(reason) < 5 then
      raise exception 'Please tell the patient why (at least 5 characters)' using errcode = '22023';
    end if;
  else
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.appointments
     set status = 'cancelled', cancelled_by = me, cancel_reason = reason, cancelled_at = now()
   where id = a.id;

  update public.payments set status = 'cancelled' where appointment_id = a.id and status = 'initiated';

  insert into public.appointment_events (appointment_id, action, actor_id, note)
  values (a.id, 'cancelled', me, reason);
end;
$$;

-- -----------------------------------------------------------------------------
-- begin_payment(): patient starts (or retries) paying for their appointment
-- -----------------------------------------------------------------------------
create or replace function public.begin_payment(p_appointment uuid, p_provider text)
returns table (payment_id uuid, tran_id text, amount numeric, currency text, due_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := public.assert_active_patient();
  a public.appointments;
  new_id uuid;
  new_tran text;
begin
  if p_provider not in ('sslcommerz', 'mock') then
    raise exception 'Unknown payment provider' using errcode = '22023';
  end if;

  perform public.expire_stale_payments(null);

  select * into a from public.appointments where id = p_appointment and patient_id = me for update;
  if not found then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;
  if a.status <> 'pending_payment' then
    raise exception 'This appointment doesn''t need payment' using errcode = '22023';
  end if;
  if coalesce(a.fee, 0) <= 0 then
    raise exception 'There is nothing to pay for this appointment' using errcode = '22023';
  end if;

  -- Only one live attempt at a time.
  update public.payments set status = 'cancelled' where appointment_id = a.id and status = 'initiated';

  new_tran := 'ML' || to_char(now(), 'YYMMDDHH24MISS') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.payments (appointment_id, patient_id, doctor_id, provider, tran_id, amount, currency)
  values (a.id, a.patient_id, a.doctor_id, p_provider, new_tran, a.fee, 'BDT')
  returning id into new_id;

  return query select new_id, new_tran, a.fee, 'BDT'::text, a.payment_due_at;
end;
$$;

revoke execute on function public.begin_payment(uuid, text) from public, anon;
grant execute on function public.begin_payment(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- complete_payment(): SERVICE ROLE ONLY, after the server has validated the
-- transaction with the gateway. Idempotent.
-- Returns the appointment id and whether a refund is needed (slot was lost).
-- -----------------------------------------------------------------------------
create or replace function public.complete_payment(
  p_tran_id      text,
  p_val_id       text,
  p_bank_tran_id text,
  p_amount       numeric,
  p_card_type    text,
  p_data         jsonb default '{}'::jsonb
)
returns table (appointment_id uuid, needs_refund boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  p public.payments;
  a public.appointments;
  pct numeric;
  commission numeric;
  slot_taken boolean;
begin
  select * into p from public.payments where tran_id = p_tran_id for update;
  if not found then
    raise exception 'Unknown transaction' using errcode = 'P0002';
  end if;
  if p.status = 'paid' then
    return query select p.appointment_id, false; -- already processed (e.g. IPN + redirect)
    return;
  end if;
  if round(p_amount, 2) <> round(p.amount, 2) then
    raise exception 'Amount mismatch' using errcode = '22023';
  end if;

  select * into a from public.appointments where id = p.appointment_id for update;
  perform pg_advisory_xact_lock(hashtextextended(a.doctor_id::text, 0));

  select s.commission_percent into pct from public.platform_settings s where s.id = 1;
  commission := round(p.amount * coalesce(pct, 0) / 100, 2);

  update public.payments
     set status = 'paid', val_id = p_val_id, bank_tran_id = p_bank_tran_id, card_type = p_card_type,
         gateway_data = coalesce(p_data, '{}'::jsonb), paid_at = now(),
         commission_amount = commission, doctor_amount = p.amount - commission
   where id = p.id;

  -- Another live payment attempt for the same appointment is now pointless.
  update public.payments set status = 'cancelled'
   where appointment_id = a.id and id <> p.id and status = 'initiated';

  if a.status = 'pending_payment'
     or (a.status = 'expired' and a.slot_start > now()) then
    -- Paid late after expiry: revive only if nobody else took the slot.
    slot_taken := a.status = 'expired' and exists (
      select 1 from public.appointments x
      where x.doctor_id = a.doctor_id and x.id <> a.id
        and x.status in ('pending_payment', 'confirmed', 'in_progress', 'completed', 'no_show')
        and x.slot_start < a.slot_end and a.slot_start < x.slot_end
    );
    if not slot_taken then
      update public.appointments
         set status = 'confirmed', payment_status = 'paid', payment_due_at = null
       where id = a.id;
      insert into public.appointment_events (appointment_id, action, note)
      values (a.id, 'payment_received', 'Paid online · ' || p.amount || ' ' || p.currency);
      return query select a.id, false;
      return;
    end if;
  end if;

  -- Paid, but the appointment can't go ahead (cancelled/expired and slot gone): refund in full.
  update public.appointments set payment_status = 'paid' where id = a.id;
  insert into public.appointment_events (appointment_id, action, note)
  values (a.id, 'payment_received', 'Paid after the booking closed — a full refund will be issued');
  return query select a.id, true;
end;
$$;

-- Payment attempt failed or was cancelled at the gateway (booking stays open to retry until its deadline).
create or replace function public.fail_payment(p_tran_id text, p_status text, p_data jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  appt uuid;
begin
  if p_status not in ('failed', 'cancelled') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  update public.payments
     set status = p_status, gateway_data = coalesce(p_data, '{}'::jsonb)
   where tran_id = p_tran_id and status = 'initiated'
  returning appointment_id into appt;
  if appt is null then
    select appointment_id into appt from public.payments where tran_id = p_tran_id;
  end if;
  return appt;
end;
$$;

-- -----------------------------------------------------------------------------
-- Refunds
-- -----------------------------------------------------------------------------
-- How much of a paid appointment is refundable under the current policy.
create or replace function public.refund_amount_for(p_appointment uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.appointments;
  paid numeric;
  s public.platform_settings;
begin
  select * into a from public.appointments where id = p_appointment;
  select amount into paid from public.payments where appointment_id = p_appointment and status = 'paid';
  if a.id is null or paid is null then
    return 0;
  end if;
  select * into s from public.platform_settings where id = 1;

  -- Patient cancelled their own appointment: time-based policy.
  if a.status = 'cancelled' and a.cancelled_by = a.patient_id then
    if a.slot_start - a.cancelled_at >= make_interval(hours => s.refund_full_hours) then
      return paid;
    end if;
    return round(paid * s.refund_partial_percent / 100, 2);
  end if;
  -- Doctor/admin cancelled, or paid for a booking that could not go ahead.
  return paid;
end;
$$;

-- Creates the refund row for a cancelled (or unfulfillable) paid appointment.
-- SERVICE ROLE ONLY. Returns null when nothing needs doing.
create or replace function public.create_refund_for(p_appointment uuid)
returns table (refund_id uuid, amount numeric, bank_tran_id text, provider text, tran_id text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  p public.payments;
  amt numeric;
  rid uuid;
begin
  select * into p from public.payments where appointment_id = p_appointment and status = 'paid' for update;
  if not found then
    return;
  end if;
  if exists (select 1 from public.refunds r where r.payment_id = p.id and r.status <> 'failed') then
    return;
  end if;

  amt := public.refund_amount_for(p_appointment);

  if amt <= 0 then
    -- Record the decision so it isn't re-evaluated; nothing to send to the gateway.
    insert into public.refunds (payment_id, appointment_id, amount, reason, status)
    values (p.id, p_appointment, 0, 'Late cancellation — not refundable under the policy', 'succeeded');
    return;
  end if;

  insert into public.refunds (payment_id, appointment_id, amount, reason, status, attempts)
  values (p.id, p_appointment, amt, 'Appointment cancelled', 'processing', 1)
  returning id into rid;

  return query select rid, amt, p.bank_tran_id, p.provider, p.tran_id;
end;
$$;

-- Retry a failed refund (creates a fresh attempt). SERVICE ROLE ONLY.
create or replace function public.retry_refund(p_refund uuid)
returns table (refund_id uuid, amount numeric, bank_tran_id text, provider text, tran_id text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.refunds;
  p public.payments;
begin
  select * into r from public.refunds where id = p_refund for update;
  if not found or r.status <> 'failed' then
    raise exception 'Only failed refunds can be retried' using errcode = '22023';
  end if;
  select * into p from public.payments where id = r.payment_id;
  update public.refunds set status = 'processing', attempts = attempts + 1, error = null where id = r.id;
  return query select r.id, r.amount, p.bank_tran_id, p.provider, p.tran_id;
end;
$$;

-- Records the gateway's answer. SERVICE ROLE ONLY.
create or replace function public.finish_refund(p_refund uuid, p_success boolean, p_ref text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refunds;
  p public.payments;
begin
  select * into r from public.refunds where id = p_refund for update;
  if not found then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;

  update public.refunds
     set status = case when p_success then 'succeeded' else 'failed' end,
         provider_ref = coalesce(p_ref, provider_ref),
         error = case when p_success then null else left(p_error, 1000) end
   where id = r.id;

  if p_success then
    select * into p from public.payments where id = r.payment_id;
    update public.appointments
       set payment_status = case when r.amount >= p.amount then 'refunded' else 'partially_refunded' end
     where id = r.appointment_id;
    insert into public.appointment_events (appointment_id, action, note)
    values (r.appointment_id, 'refunded', 'Refunded ' || r.amount || ' ' || p.currency);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Doctor earnings & payouts
-- -----------------------------------------------------------------------------
create or replace function public.doctor_earnings(p_doctor uuid)
returns table (
  gross      numeric,
  commission numeric,
  refunded   numeric,
  net        numeric,
  paid_out   numeric,
  balance    numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with allowed as (
    select (p_doctor = auth.uid() or public.is_admin()) as ok
  ),
  paid as (
    select
      coalesce(sum(p.amount), 0) as gross,
      coalesce(sum(p.commission_amount), 0) as commission,
      -- The doctor's share of refunds (refunds are split in the same ratio).
      coalesce(sum((
        select coalesce(sum(r.amount), 0) from public.refunds r
        where r.payment_id = p.id and r.status = 'succeeded'
      ) * case when p.amount > 0 then p.doctor_amount / p.amount else 0 end), 0) as doctor_refunded,
      coalesce(sum(p.doctor_amount), 0) as doctor_total
    from public.payments p
    where p.doctor_id = p_doctor and p.status = 'paid'
  ),
  outs as (
    select coalesce(sum(amount), 0) as total from public.payouts where doctor_id = p_doctor
  )
  select
    round(pd.gross, 2),
    round(pd.commission, 2),
    round(pd.doctor_refunded, 2),
    round(pd.doctor_total - pd.doctor_refunded, 2),
    round(o.total, 2),
    round(pd.doctor_total - pd.doctor_refunded - o.total, 2)
  from paid pd, outs o, allowed
  where allowed.ok;
$$;

create or replace function public.admin_record_payout(
  p_doctor    uuid,
  p_amount    numeric,
  p_method    text,
  p_reference text default null,
  p_note      text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  bal numeric;
  pid uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can record payouts' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero' using errcode = '22023';
  end if;
  select e.balance into bal from public.doctor_earnings(p_doctor) e;
  if bal is null or p_amount > bal then
    raise exception 'Amount is more than the doctor''s balance (%)', coalesce(bal, 0) using errcode = '22023';
  end if;

  insert into public.payouts (doctor_id, amount, method, reference, note, created_by)
  values (p_doctor, round(p_amount, 2), p_method, nullif(trim(coalesce(p_reference, '')), ''),
          nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into pid;
  return pid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke execute on function public.complete_payment(text, text, text, numeric, text, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_payment(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.create_refund_for(uuid) from public, anon, authenticated;
revoke execute on function public.retry_refund(uuid) from public, anon, authenticated;
revoke execute on function public.finish_refund(uuid, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.refund_amount_for(uuid) from public, anon, authenticated;
grant execute on function public.complete_payment(text, text, text, numeric, text, jsonb) to service_role;
grant execute on function public.fail_payment(text, text, jsonb) to service_role;
grant execute on function public.create_refund_for(uuid) to service_role;
grant execute on function public.retry_refund(uuid) to service_role;
grant execute on function public.finish_refund(uuid, boolean, text, text) to service_role;
grant execute on function public.refund_amount_for(uuid) to service_role;

revoke execute on function public.doctor_earnings(uuid) from public, anon;
grant execute on function public.doctor_earnings(uuid) to authenticated;
revoke execute on function public.admin_record_payout(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.admin_record_payout(uuid, numeric, text, text, text) to authenticated;
