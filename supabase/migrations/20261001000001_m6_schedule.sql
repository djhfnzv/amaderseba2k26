-- =============================================================================
-- M6. Schedule Engine
-- Tables: doctor_availability (weekly blocks), doctor_leaves (blocked dates)
-- Column: doctor_profiles.timezone
-- Function: get_available_slots()
--
-- Slot model (platform rules):
--   * A new slot starts every 30 minutes from the block start (9:00, 9:30, …).
--   * Each block has a consultation length of 15–25 min (default 20); the rest
--     of the 30 minutes is buffer for overruns.
--   * Patients can book from 2 hours ahead up to 30 days ahead.
-- Weekly hours and leave dates are stored in the doctor's LOCAL time zone;
-- generated slots are returned as UTC timestamptz (display in viewer's zone).
-- Booked slots are excluded from M7 on.
-- Requires: M1 (is_admin, current_user_role), M2 (set_updated_at),
--           M3 (doctor_profiles, doctor_chambers, doctor_is_public).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Doctor time zone
-- -----------------------------------------------------------------------------
alter table public.doctor_profiles
  add column if not exists timezone text not null default 'Asia/Dhaka';

create or replace function public.validate_doctor_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists doctor_profiles_validate_timezone on public.doctor_profiles;
create trigger doctor_profiles_validate_timezone
  before insert or update of timezone on public.doctor_profiles
  for each row execute function public.validate_doctor_timezone();

-- -----------------------------------------------------------------------------
-- doctor_availability: weekly time blocks
-- -----------------------------------------------------------------------------
create table if not exists public.doctor_availability (
  id                   uuid primary key default gen_random_uuid(),
  doctor_id            uuid not null default auth.uid() references public.doctor_profiles (user_id) on delete cascade,
  weekday              smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time           time not null,
  end_time             time not null,
  consultation_type    text not null check (consultation_type in ('online', 'in_person')),
  -- Deleting a chamber removes its schedule blocks.
  chamber_id           uuid references public.doctor_chambers (id) on delete cascade,
  consultation_minutes smallint not null default 20 check (consultation_minutes between 15 and 25),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint doctor_availability_time_order check (end_time > start_time),
  constraint doctor_availability_fits_one_slot
    check (end_time - start_time >= make_interval(mins => consultation_minutes)),
  constraint doctor_availability_chamber check (
    (consultation_type = 'online' and chamber_id is null)
    or (consultation_type = 'in_person' and chamber_id is not null)
  )
);

create index if not exists doctor_availability_doctor_idx
  on public.doctor_availability (doctor_id, weekday);

drop trigger if exists doctor_availability_set_updated_at on public.doctor_availability;
create trigger doctor_availability_set_updated_at
  before update on public.doctor_availability
  for each row execute function public.set_updated_at();

-- No overlapping active blocks on the same weekday; chamber must be the doctor's own.
create or replace function public.guard_doctor_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.chamber_id is not null and not exists (
    select 1 from public.doctor_chambers c
    where c.id = new.chamber_id and c.doctor_id = new.doctor_id
  ) then
    raise exception 'Choose one of your own chambers' using errcode = '22023';
  end if;

  if new.is_active and exists (
    select 1 from public.doctor_availability a
    where a.doctor_id = new.doctor_id
      and a.weekday = new.weekday
      and a.is_active
      and a.id <> new.id
      and a.start_time < new.end_time
      and new.start_time < a.end_time
  ) then
    raise exception 'This time overlaps another block on the same day' using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists doctor_availability_guard on public.doctor_availability;
create trigger doctor_availability_guard
  before insert or update on public.doctor_availability
  for each row execute function public.guard_doctor_availability();

alter table public.doctor_availability enable row level security;

create policy "doctors read own availability"
  on public.doctor_availability for select to authenticated
  using (doctor_id = auth.uid() or public.is_admin());
create policy "doctors add own availability"
  on public.doctor_availability for insert to authenticated
  with check (doctor_id = auth.uid() and public.current_user_role() = 'doctor');
create policy "doctors update own availability"
  on public.doctor_availability for update to authenticated
  using (doctor_id = auth.uid()) with check (doctor_id = auth.uid());
create policy "doctors delete own availability"
  on public.doctor_availability for delete to authenticated
  using (doctor_id = auth.uid());

revoke all on public.doctor_availability from anon;
grant select, insert, update, delete on public.doctor_availability to authenticated;

-- -----------------------------------------------------------------------------
-- doctor_leaves: whole days (times null) or part of a single day
-- -----------------------------------------------------------------------------
create table if not exists public.doctor_leaves (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null default auth.uid() references public.doctor_profiles (user_id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  start_time time,
  end_time   time,
  reason     text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  constraint doctor_leaves_date_order check (end_date >= start_date),
  constraint doctor_leaves_max_length check (end_date - start_date <= 365),
  constraint doctor_leaves_times check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time and start_date = end_date)
  )
);

create index if not exists doctor_leaves_doctor_idx
  on public.doctor_leaves (doctor_id, end_date);

alter table public.doctor_leaves enable row level security;

-- Leave reasons are private: only the doctor and admins can read them.
create policy "doctors read own leaves"
  on public.doctor_leaves for select to authenticated
  using (doctor_id = auth.uid() or public.is_admin());
create policy "doctors add own leaves"
  on public.doctor_leaves for insert to authenticated
  with check (doctor_id = auth.uid() and public.current_user_role() = 'doctor');
create policy "doctors delete own leaves"
  on public.doctor_leaves for delete to authenticated
  using (doctor_id = auth.uid());

revoke all on public.doctor_leaves from anon;
revoke update on public.doctor_leaves from authenticated;
grant select, insert, delete on public.doctor_leaves to authenticated;

-- -----------------------------------------------------------------------------
-- get_available_slots(): bookable slots for one doctor
--   p_from  first local date (defaults to today in the doctor's zone)
--   p_days  number of days (1–31), capped at the 30-day booking window
--   p_type  'online' | 'in_person' | null for both
-- Visible for public doctors, the doctor themself, and admins.
-- SECURITY DEFINER so patients see free slots without reading leave reasons.
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
  )
  select
    r.local_start at time zone tz,
    (r.local_start + make_interval(mins => r.minutes)) at time zone tz,
    r.ctype,
    r.chamber,
    r.minutes
  from raw r
  where (r.local_start at time zone tz) >= now() + min_notice
    and not exists (
      select 1 from public.doctor_leaves l
      where l.doctor_id = p_doctor
        and r.d between l.start_date and l.end_date
        and (
          l.start_time is null
          or (r.local_start::time < l.end_time
              and (r.local_start + make_interval(mins => r.minutes))::time > l.start_time)
        )
    )
  order by 1, 3;
end;
$$;

revoke execute on function public.get_available_slots(uuid, date, integer, text) from public;
grant execute on function public.get_available_slots(uuid, date, integer, text) to anon, authenticated;
