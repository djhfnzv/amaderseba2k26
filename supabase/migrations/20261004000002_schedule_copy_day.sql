-- =============================================================================
-- Schedule: copy one weekday's hours to other weekdays (atomic).
-- Replaces the target days' blocks with copies of the source day's blocks.
-- SECURITY INVOKER: RLS limits it to the caller's own schedule, and the M6
-- guard trigger still rejects overlaps / other doctors' chambers.
-- Requires: M6 (doctor_availability).
-- =============================================================================

create or replace function public.copy_availability_day(p_from smallint, p_to smallint[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  targets smallint[];
  n integer;
begin
  if public.current_user_role() is distinct from 'doctor' then
    raise exception 'Only doctors can edit schedules' using errcode = '42501';
  end if;

  select array_agg(distinct t) into targets
  from unnest(p_to) t
  where t between 0 and 6 and t <> p_from;
  if targets is null then
    raise exception 'Choose at least one other day' using errcode = '22023';
  end if;

  if not exists (select 1 from public.doctor_availability where doctor_id = auth.uid() and weekday = p_from) then
    raise exception 'That day has no hours to copy' using errcode = '22023';
  end if;

  delete from public.doctor_availability
   where doctor_id = auth.uid() and weekday = any (targets);

  insert into public.doctor_availability
    (weekday, start_time, end_time, consultation_type, chamber_id, consultation_minutes, is_active)
  select t, a.start_time, a.end_time, a.consultation_type, a.chamber_id, a.consultation_minutes, a.is_active
  from public.doctor_availability a
  cross join unnest(targets) t
  where a.doctor_id = auth.uid() and a.weekday = p_from;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.copy_availability_day(smallint, smallint[]) from public, anon;
grant execute on function public.copy_availability_day(smallint, smallint[]) to authenticated;
