-- =============================================================================
-- M7. Appointments & Booking
-- Tables: appointments, slot_holds, appointment_events
-- Functions: hold_slot, release_hold, confirm_booking, cancel_appointment,
--            reschedule_appointment, update_appointment_status,
--            doctor_has_patient, patient_has_doctor
-- Updates: get_available_slots (exclude booked/held), search_doctors (next slot)
--
-- Rules
--   * Patient picks a slot -> 5-minute hold -> confirms -> CONFIRMED
--     (auto-confirm; payment arrives in M8, until then payment_status='unpaid').
--   * One upcoming appointment per patient per doctor.
--   * Patients may cancel/reschedule up to 2 hours before; doctors any time
--     (cancel needs a reason).
--   * No double booking: unique (doctor_id, slot_start) for live appointments.
--   * Doctors can read a patient's health profile & reports only once that
--     patient has booked them (FR-D-07).
-- All state changes go through SECURITY DEFINER functions; no direct writes.
-- Requires: M1-M6.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- appointments
-- -----------------------------------------------------------------------------
create table if not exists public.appointments (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid not null references public.users (id) on delete cascade,
  doctor_id            uuid not null references public.doctor_profiles (user_id) on delete cascade,
  slot_start           timestamptz not null,
  slot_end             timestamptz not null,
  consultation_type    text not null check (consultation_type in ('online', 'in_person')),
  chamber_id           uuid references public.doctor_chambers (id) on delete set null,
  status               text not null default 'confirmed'
                       check (status in ('pending_payment', 'confirmed', 'in_progress',
                                         'completed', 'cancelled', 'expired', 'no_show')),
  fee                  numeric(10, 2),
  payment_status       text not null default 'unpaid'
                       check (payment_status in ('unpaid', 'paid', 'refunded', 'waived')),
  patient_note         text check (char_length(patient_note) <= 500),
  cancelled_by         uuid references public.users (id) on delete set null,
  cancel_reason        text check (char_length(cancel_reason) <= 500),
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint appointments_time_order check (slot_end > slot_start)
);

-- NFR-04: no double booking of a doctor, no patient in two places at once.
create unique index if not exists appointments_doctor_slot_uniq
  on public.appointments (doctor_id, slot_start)
  where status in ('pending_payment', 'confirmed', 'in_progress', 'completed', 'no_show');
create unique index if not exists appointments_patient_slot_uniq
  on public.appointments (patient_id, slot_start)
  where status in ('pending_payment', 'confirmed', 'in_progress', 'completed', 'no_show');

create index if not exists appointments_doctor_time_idx on public.appointments (doctor_id, slot_start);
create index if not exists appointments_patient_time_idx on public.appointments (patient_id, slot_start);

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- slot_holds: a slot reserved for 5 minutes while the patient confirms
-- -----------------------------------------------------------------------------
create table if not exists public.slot_holds (
  id                uuid primary key default gen_random_uuid(),
  doctor_id         uuid not null references public.doctor_profiles (user_id) on delete cascade,
  patient_id        uuid not null references public.users (id) on delete cascade,
  slot_start        timestamptz not null,
  slot_end          timestamptz not null,
  consultation_type text not null check (consultation_type in ('online', 'in_person')),
  chamber_id        uuid references public.doctor_chambers (id) on delete cascade,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  unique (doctor_id, slot_start)
);

create index if not exists slot_holds_patient_idx on public.slot_holds (patient_id);

-- -----------------------------------------------------------------------------
-- appointment_events: append-only history
-- -----------------------------------------------------------------------------
create table if not exists public.appointment_events (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  action         text not null check (action in ('booked', 'cancelled', 'rescheduled', 'started', 'completed', 'no_show')),
  actor_id       uuid references public.users (id) on delete set null,
  note           text check (char_length(note) <= 500),
  created_at     timestamptz not null default now()
);

create index if not exists appointment_events_appt_idx on public.appointment_events (appointment_id, created_at);

-- -----------------------------------------------------------------------------
-- Relationship helpers (used by RLS on other modules' tables)
-- -----------------------------------------------------------------------------
-- The caller is a doctor who has (or had) a real appointment with this patient.
create or replace function public.doctor_has_patient(patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.appointments a
    where a.doctor_id = auth.uid()
      and a.patient_id = patient
      and a.status in ('pending_payment', 'confirmed', 'in_progress', 'completed', 'no_show')
  );
$$;

-- The caller is a patient who has (or had) an appointment with this doctor.
create or replace function public.patient_has_doctor(doctor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.appointments a
    where a.patient_id = auth.uid() and a.doctor_id = doctor
  );
$$;

grant execute on function public.doctor_has_patient(uuid) to anon, authenticated;
grant execute on function public.patient_has_doctor(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.appointments enable row level security;
alter table public.slot_holds enable row level security;
alter table public.appointment_events enable row level security;

create policy "patients read own appointments" on public.appointments for select to authenticated
  using (patient_id = auth.uid());
create policy "doctors read own appointments" on public.appointments for select to authenticated
  using (doctor_id = auth.uid());
create policy "admins read all appointments" on public.appointments for select to authenticated
  using (public.is_admin());

create policy "patients read own holds" on public.slot_holds for select to authenticated
  using (patient_id = auth.uid());

create policy "participants read appointment history" on public.appointment_events for select to authenticated
  using (exists (
    select 1 from public.appointments a
    where a.id = appointment_id and (a.patient_id = auth.uid() or a.doctor_id = auth.uid())
  ) or public.is_admin());

revoke all on public.appointments, public.slot_holds, public.appointment_events from anon;
revoke insert, update, delete on public.appointments, public.slot_holds, public.appointment_events from authenticated;
grant select on public.appointments, public.slot_holds, public.appointment_events to authenticated;

-- FR-D-07: doctors see their own patients' name, health profile and reports.
create policy "doctors read their patients" on public.users for select to authenticated
  using (public.doctor_has_patient(id));
create policy "doctors read their patients' profiles" on public.patient_profiles for select to authenticated
  using (public.doctor_has_patient(user_id));
create policy "doctors read their patients' files" on public.medical_files for select to authenticated
  using (public.doctor_has_patient(patient_id));
create policy "doctors read their patients' file objects" on storage.objects for select to authenticated
  using (
    bucket_id = 'medical-files'
    and exists (
      select 1 from public.appointments a
      where a.doctor_id = auth.uid()
        and a.patient_id::text = (storage.foldername(name))[1]
        and a.status in ('pending_payment', 'confirmed', 'in_progress', 'completed', 'no_show')
    )
  );

-- Patients keep seeing their doctor's details on past bookings even if the
-- doctor is later unpublished.
create policy "patients read their doctors" on public.doctor_profiles for select to authenticated
  using (public.patient_has_doctor(user_id));
create policy "patients read their doctors' chambers" on public.doctor_chambers for select to authenticated
  using (public.patient_has_doctor(doctor_id));

-- -----------------------------------------------------------------------------
-- get_available_slots(): now excludes booked and held slots
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
        and a.status in ('pending_payment', 'confirmed', 'in_progress')
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
-- Booking functions
-- -----------------------------------------------------------------------------
create or replace function public.assert_active_patient()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.users u where u.id = me and u.role = 'patient' and u.status = 'active') then
    raise exception 'Only patients can book appointments' using errcode = '42501';
  end if;
  return me;
end;
$$;

revoke execute on function public.assert_active_patient() from public, anon;
grant execute on function public.assert_active_patient() to authenticated;

-- Reserve a slot for 5 minutes. Replaces any earlier hold by the same patient.
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

  -- Serialise bookings per doctor so two patients can't race for one slot.
  perform pg_advisory_xact_lock(hashtextextended(p_doctor::text, 0));

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

create or replace function public.release_hold(p_hold uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.slot_holds where id = p_hold and patient_id = auth.uid();
$$;

-- Turn a live hold into a confirmed appointment.
create or replace function public.confirm_booking(p_hold uuid, p_note text default null)
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
begin
  select * into h from public.slot_holds where id = p_hold and patient_id = me for update;
  if not found or h.expires_at <= now() then
    delete from public.slot_holds where id = p_hold and patient_id = me;
    raise exception 'Your 5-minute hold has expired. Please pick the slot again.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(h.doctor_id::text, 0));

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

  begin
    insert into public.appointments (
      patient_id, doctor_id, slot_start, slot_end, consultation_type, chamber_id,
      status, fee, patient_note
    ) values (
      me, h.doctor_id, h.slot_start, h.slot_end, h.consultation_type, h.chamber_id,
      'confirmed', fee, nullif(trim(coalesce(p_note, '')), '')
    )
    returning id into appt_id;
  exception when unique_violation then
    raise exception 'That slot was just taken. Please pick another time.' using errcode = '22023';
  end;

  insert into public.appointment_events (appointment_id, action, actor_id)
  values (appt_id, 'booked', me);

  delete from public.slot_holds where id = h.id;
  return appt_id;
end;
$$;

-- Cancel: patient (>= 2h before), the doctor (reason required) or an admin.
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
    if a.slot_start - now() < interval '2 hours' then
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

  insert into public.appointment_events (appointment_id, action, actor_id, note)
  values (a.id, 'cancelled', me, reason);
end;
$$;

-- Move to another free slot of the same consultation type.
create or replace function public.reschedule_appointment(p_id uuid, p_new_start timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  a public.appointments;
  tz text;
  s record;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;
  if a.status not in ('pending_payment', 'confirmed') then
    raise exception 'This appointment can no longer be rescheduled' using errcode = '22023';
  end if;
  if a.patient_id = me then
    if a.slot_start - now() < interval '2 hours' then
      raise exception 'Appointments can be rescheduled up to 2 hours before the start time' using errcode = '22023';
    end if;
  elsif a.doctor_id <> me then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(a.doctor_id::text, 0));

  select dp.timezone into tz from public.doctor_profiles dp where dp.user_id = a.doctor_id;
  select g.* into s
  from public.get_available_slots(a.doctor_id, (p_new_start at time zone tz)::date, 1, a.consultation_type) g
  where g.slot_start = p_new_start
  limit 1;
  if not found then
    raise exception 'That slot is no longer available. Please pick another time.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.appointments x
    where x.patient_id = a.patient_id and x.id <> a.id
      and x.status in ('pending_payment', 'confirmed', 'in_progress')
      and x.slot_start < s.slot_end and s.slot_start < x.slot_end
  ) then
    raise exception 'The patient already has another appointment at that time' using errcode = '22023';
  end if;

  begin
    update public.appointments
       set slot_start = s.slot_start, slot_end = s.slot_end, chamber_id = s.chamber_id
     where id = a.id;
  exception when unique_violation then
    raise exception 'That slot was just taken. Please pick another time.' using errcode = '22023';
  end;

  insert into public.appointment_events (appointment_id, action, actor_id, note)
  values (a.id, 'rescheduled', me, 'From ' || to_char(a.slot_start at time zone tz, 'DD Mon YYYY HH12:MI AM'));
end;
$$;

-- Doctor marks progress: start (from 15 min before), complete, no_show.
create or replace function public.update_appointment_status(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  a public.appointments;
  new_status text;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found or a.doctor_id <> me then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;

  if p_action = 'start' then
    if a.status <> 'confirmed' then
      raise exception 'Only confirmed appointments can be started' using errcode = '22023';
    end if;
    if now() < a.slot_start - interval '15 minutes' then
      raise exception 'You can start up to 15 minutes before the appointment' using errcode = '22023';
    end if;
    new_status := 'in_progress';
  elsif p_action = 'complete' then
    if a.status not in ('confirmed', 'in_progress') then
      raise exception 'This appointment cannot be completed' using errcode = '22023';
    end if;
    if now() < a.slot_start then
      raise exception 'You can complete it once the appointment has started' using errcode = '22023';
    end if;
    new_status := 'completed';
  elsif p_action = 'no_show' then
    if a.status <> 'confirmed' then
      raise exception 'Only confirmed appointments can be marked as no-show' using errcode = '22023';
    end if;
    if now() < a.slot_start then
      raise exception 'You can mark a no-show once the start time has passed' using errcode = '22023';
    end if;
    new_status := 'no_show';
  else
    raise exception 'Unknown action' using errcode = '22023';
  end if;

  update public.appointments set status = new_status where id = a.id;

  insert into public.appointment_events (appointment_id, action, actor_id)
  values (a.id, case p_action when 'start' then 'started' when 'complete' then 'completed' else 'no_show' end, me);
end;
$$;

revoke execute on function public.hold_slot(uuid, timestamptz, text) from public, anon;
revoke execute on function public.release_hold(uuid) from public, anon;
revoke execute on function public.confirm_booking(uuid, text) from public, anon;
revoke execute on function public.cancel_appointment(uuid, text) from public, anon;
revoke execute on function public.reschedule_appointment(uuid, timestamptz) from public, anon;
revoke execute on function public.update_appointment_status(uuid, text) from public, anon;
grant execute on function public.hold_slot(uuid, timestamptz, text) to authenticated;
grant execute on function public.release_hold(uuid) to authenticated;
grant execute on function public.confirm_booking(uuid, text) to authenticated;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
grant execute on function public.reschedule_appointment(uuid, timestamptz) to authenticated;
grant execute on function public.update_appointment_status(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- search_doctors(): add next available slot + "available within N days" filter
-- (return type changes, so drop and recreate)
-- -----------------------------------------------------------------------------
drop function if exists public.search_doctors(text, text, text, numeric, numeric, text, text, text, integer, integer);

create or replace function public.search_doctors(
  p_query          text    default null,
  p_specialty      text    default null,
  p_type           text    default null,
  p_min_fee        numeric default null,
  p_max_fee        numeric default null,
  p_language       text    default null,
  p_city           text    default null,
  p_sort           text    default 'relevance',
  p_limit          integer default 12,
  p_offset         integer default 0,
  p_available_days integer default null
)
returns table (
  user_id             uuid,
  slug                text,
  display_name        text,
  headline            text,
  photo_path          text,
  practice_since_year smallint,
  languages           text[],
  offers_online       boolean,
  offers_in_person    boolean,
  fee_online          numeric,
  fee_in_person       numeric,
  specialties         text[],
  degrees             text[],
  cities              text[],
  next_available      timestamptz,
  total_count         bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(trim(p_query), '') as q,
      '%' || replace(replace(replace(coalesce(trim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  ),
  base as (
    select
      dp.user_id, dp.slug, dp.display_name, dp.headline, dp.photo_path, dp.practice_since_year,
      dp.languages, dp.offers_online, dp.offers_in_person, dp.fee_online, dp.fee_in_person,
      dp.verified_at, dp.timezone,
      case p_type
        when 'online' then dp.fee_online
        when 'in_person' then dp.fee_in_person
        else least(
          case when dp.offers_online then dp.fee_online end,
          case when dp.offers_in_person then dp.fee_in_person end
        )
      end as fee,
      coalesce((
        select array_agg(s.name order by ds.is_primary desc, s.name)
        from public.doctor_specialties ds join public.specialties s on s.id = ds.specialty_id
        where ds.doctor_id = dp.user_id
      ), '{}') as specialties,
      coalesce((
        select array_agg(s.slug)
        from public.doctor_specialties ds join public.specialties s on s.id = ds.specialty_id
        where ds.doctor_id = dp.user_id
      ), '{}') as specialty_slugs,
      coalesce((
        select array_agg(e.degree order by e.year nulls last, e.created_at)
        from public.doctor_education e where e.doctor_id = dp.user_id
      ), '{}') as degrees,
      coalesce((
        select array_agg(distinct c.city order by c.city)
        from public.doctor_chambers c where c.doctor_id = dp.user_id
      ), '{}') as cities
    from public.doctor_profiles dp
    where dp.is_verified and public.doctor_is_public(dp.user_id)
  ),
  filtered as (
    select b.*
    from base b cross join params p
    where (
        p.q is null
        or b.display_name ilike p.pattern
        or b.headline ilike p.pattern
        or exists (select 1 from unnest(b.specialties) sp where sp ilike p.pattern)
      )
      and (nullif(p_specialty, '') is null or p_specialty = any (b.specialty_slugs))
      and (
        nullif(p_type, '') is null
        or (p_type = 'online' and b.offers_online)
        or (p_type = 'in_person' and b.offers_in_person)
      )
      and (p_min_fee is null or b.fee >= p_min_fee)
      and (p_max_fee is null or b.fee <= p_max_fee)
      and (nullif(p_language, '') is null
           or exists (select 1 from unnest(b.languages) l where lower(l) = lower(p_language)))
      and (nullif(p_city, '') is null
           or exists (select 1 from unnest(b.cities) c where lower(c) = lower(p_city)))
  ),
  with_next as (
    select
      f.*,
      (
        select min(g.slot_start)
        from public.get_available_slots(f.user_id, null, 30, nullif(p_type, '')) g
      ) as next_available
    from filtered f
  )
  select
    w.user_id, w.slug, w.display_name, w.headline, w.photo_path, w.practice_since_year,
    w.languages, w.offers_online, w.offers_in_person, w.fee_online, w.fee_in_person,
    w.specialties, w.degrees, w.cities, w.next_available,
    count(*) over () as total_count
  from with_next w
  cross join params p
  where p_available_days is null
     or (w.next_available is not null
         and (w.next_available at time zone w.timezone)::date
             <= (now() at time zone w.timezone)::date + greatest(p_available_days, 1) - 1)
  order by
    case
      when p_sort = 'relevance' and p.q is not null
        and starts_with(regexp_replace(lower(w.display_name), '^dr\.?\s+', ''), lower(p.q)) then 0
      when p_sort = 'relevance' and p.q is not null and w.display_name ilike p.pattern then 1
      else 2
    end,
    case when p_sort = 'soonest' then w.next_available end asc nulls last,
    case when p_sort = 'fee_asc' then w.fee end asc nulls last,
    case when p_sort = 'fee_desc' then w.fee end desc nulls last,
    case when p_sort = 'experience' then w.practice_since_year end asc nulls last,
    w.verified_at desc nulls last,
    w.display_name
  limit least(greatest(coalesce(p_limit, 12), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.search_doctors(text, text, text, numeric, numeric, text, text, text, integer, integer, integer)
  to anon, authenticated;
