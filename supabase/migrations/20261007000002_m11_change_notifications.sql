-- =============================================================================
-- M11 (part 2). Tell the other person when something that affects them changes
--   * patient adds / deletes a medical report  -> doctors with upcoming visits
--   * doctor leave or changed hours clash with a booking -> that patient (+ doctor)
--   * doctor changes a fee / chamber details, or removes a chamber -> booked patients
--   * doctor saves / discards a prescription draft -> the patient
-- In-app for everything; SMS only where the patient may need to act
-- (clashing bookings, chamber changes). Requires 20261007000001.
-- =============================================================================

-- Live bookings still ahead (not cancelled/expired/done).
create or replace function public.upcoming_live_appointments(p_doctor uuid)
returns setof public.appointments
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.appointments
   where doctor_id = p_doctor
     and status in ('pending_payment', 'confirmed')
     and slot_end > now();
$$;

revoke execute on function public.upcoming_live_appointments(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Medical reports -> doctors the patient is about to see
-- -----------------------------------------------------------------------------
create or replace function public.notify_medical_file_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  f        public.medical_files := coalesce(new, old);
  pat_name text;
  r        record;
begin
  select coalesce(nullif(u.full_name, ''), u.email) into pat_name from public.users u where u.id = f.patient_id;
  if pat_name is null then
    return null; -- account being deleted
  end if;

  -- One notification per doctor, pointing at the next visit.
  for r in
    select distinct on (a.doctor_id) a.id, a.doctor_id
      from public.appointments a
     where a.patient_id = f.patient_id
       and a.status in ('pending_payment', 'confirmed', 'in_progress')
       and a.slot_end > now()
     order by a.doctor_id, a.slot_start
  loop
    perform public.notify(r.doctor_id,
      case tg_op when 'INSERT' then 'report_added' else 'report_deleted' end,
      case tg_op when 'INSERT' then format('New report from %s', pat_name) else format('%s deleted a report', pat_name) end,
      case tg_op when 'INSERT' then format('“%s” was added before your upcoming appointment.', f.title)
                 else format('“%s” is no longer available.', f.title) end,
      '/doctor/appointments/' || r.id, null,
      'file:' || lower(tg_op) || ':' || f.id || ':' || r.doctor_id);
  end loop;
  return null;
exception when others then
  raise warning 'notify_medical_file_change failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists medical_files_notify on public.medical_files;
create trigger medical_files_notify
  after insert or delete on public.medical_files
  for each row execute function public.notify_medical_file_change();

-- -----------------------------------------------------------------------------
-- Bookings that no longer fit the doctor's hours, or fall on their leave
-- -----------------------------------------------------------------------------
create or replace function public.notify_schedule_clashes(p_doctor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz       text;
  doc_name text;
  a        public.appointments;
  local_s  timestamp;
  local_e  timestamp;
  on_leave boolean;
  covered  boolean;
  label    text;
  pat_name text;
  n        integer := 0;
begin
  select d.timezone, d.display_name into tz, doc_name from public.doctor_profiles d where d.user_id = p_doctor;
  if not found then
    return 0;
  end if;

  for a in select * from public.upcoming_live_appointments(p_doctor) loop
    local_s := a.slot_start at time zone tz;
    local_e := a.slot_end at time zone tz;

    on_leave := exists (
      select 1 from public.doctor_leaves l
       where l.doctor_id = p_doctor
         and local_s::date between l.start_date and l.end_date
         and (l.start_time is null or (l.start_time < local_e::time and local_s::time < l.end_time))
    );
    covered := exists (
      select 1 from public.doctor_availability b
       where b.doctor_id = p_doctor
         and b.is_active
         and b.weekday = extract(dow from local_s)::int
         and b.start_time <= local_s::time
         and b.end_time >= local_e::time
         and b.consultation_type = a.consultation_type
         and (a.consultation_type = 'online' or b.chamber_id = a.chamber_id)
    );
    -- In-person visits whose chamber was removed are handled by the chamber trigger.
    if a.consultation_type = 'in_person' and a.chamber_id is null then
      covered := true;
    end if;

    if on_leave or not covered then
      label := public.slot_label(a.slot_start, tz);
      select coalesce(nullif(u.full_name, ''), u.email, 'A patient') into pat_name from public.users u where u.id = a.patient_id;
      if public.notify(a.patient_id, 'appointment_clash',
           case when on_leave then 'Your doctor is unavailable' else 'Your doctor changed their hours' end,
           format('%s %s at the time of your appointment on %s. Please reschedule, or contact the doctor.',
                  coalesce(doc_name, 'Your doctor'),
                  case when on_leave then 'will be on leave' else 'is no longer available' end, label),
           '/patient/appointments/' || a.id,
           format('%s may not be available for your appointment on %s. Please reschedule from your MedLife account.',
                  coalesce(doc_name, 'Your doctor'), label),
           'clash:' || case when on_leave then 'leave' else 'hours' end || ':' || a.id, a.slot_start) is not null then
        n := n + 1;
        perform public.notify(p_doctor, 'appointment_clash', 'Booking outside your hours',
          format('%s''s appointment on %s %s. Reschedule or cancel it.', pat_name, label,
                 case when on_leave then 'falls on your leave' else 'is outside your hours' end),
          '/doctor/appointments/' || a.id, null,
          'clash:d:' || case when on_leave then 'leave' else 'hours' end || ':' || a.id);
      end if;
    end if;
  end loop;
  return n;
end;
$$;

revoke execute on function public.notify_schedule_clashes(uuid) from public, anon, authenticated;

-- Deferred to commit, so "replace this day's hours" (delete + insert in one
-- transaction) only warns about bookings that really lost their slot.
create or replace function public.check_schedule_clashes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_schedule_clashes(coalesce(new.doctor_id, old.doctor_id));
  return null;
exception when others then
  raise warning 'check_schedule_clashes failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists doctor_availability_clashes on public.doctor_availability;
create constraint trigger doctor_availability_clashes
  after update or delete on public.doctor_availability
  deferrable initially deferred
  for each row execute function public.check_schedule_clashes();

drop trigger if exists doctor_leaves_clashes on public.doctor_leaves;
create constraint trigger doctor_leaves_clashes
  after insert on public.doctor_leaves
  deferrable initially deferred
  for each row execute function public.check_schedule_clashes();

-- -----------------------------------------------------------------------------
-- Fee and time-zone changes (doctor profile)
-- -----------------------------------------------------------------------------
create or replace function public.notify_doctor_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a   public.appointments;
  fee numeric;
begin
  if new.fee_online is distinct from old.fee_online or new.fee_in_person is distinct from old.fee_in_person then
    for a in select * from public.upcoming_live_appointments(new.user_id) loop
      if (a.consultation_type = 'online' and new.fee_online is distinct from old.fee_online)
         or (a.consultation_type = 'in_person' and new.fee_in_person is distinct from old.fee_in_person) then
        fee := case a.consultation_type when 'online' then new.fee_online else new.fee_in_person end;
        perform public.notify(a.patient_id, 'fee_changed', format('%s changed their fee', new.display_name),
          format('The %s fee is now ৳%s. Your booking on %s keeps its fee of ৳%s.',
                 case a.consultation_type when 'online' then 'online consultation' else 'chamber visit' end,
                 coalesce(fee::text, '—'), public.slot_label(a.slot_start, new.timezone), coalesce(a.fee::text, '0')),
          '/patient/appointments/' || a.id, null,
          'fee:' || a.id || ':' || txid_current());
      end if;
    end loop;
  end if;

  if new.timezone is distinct from old.timezone then
    perform public.notify_schedule_clashes(new.user_id);
  end if;
  return null;
exception when others then
  raise warning 'notify_doctor_profile_change failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists doctor_profiles_notify on public.doctor_profiles;
create trigger doctor_profiles_notify
  after update of fee_online, fee_in_person, timezone on public.doctor_profiles
  for each row execute function public.notify_doctor_profile_change();

-- -----------------------------------------------------------------------------
-- Chamber details changed / chamber removed -> booked in-person patients
-- -----------------------------------------------------------------------------
create or replace function public.notify_chamber_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a        public.appointments;
  doc_name text;
  tz       text;
  label    text;
begin
  if tg_op = 'UPDATE' then
    if row(new.name, new.address, new.city, new.phone)
       is not distinct from row(old.name, old.address, old.city, old.phone) then
      return null;
    end if;
  end if;
  select d.display_name, d.timezone into doc_name, tz from public.doctor_profiles d where d.user_id = old.doctor_id;

  for a in
    select * from public.upcoming_live_appointments(old.doctor_id) x
     where x.consultation_type = 'in_person' and x.chamber_id = old.id
  loop
    label := public.slot_label(a.slot_start, tz);
    if tg_op = 'UPDATE' then
      perform public.notify(a.patient_id, 'chamber_changed', 'Chamber details updated',
        format('For your visit on %s: %s, %s, %s%s.', label, new.name, new.address, new.city,
               coalesce(' · ' || new.phone, '')),
        '/patient/appointments/' || a.id,
        left(format('Your visit with %s on %s is at %s, %s, %s.', coalesce(doc_name, 'your doctor'), label,
                    new.name, new.address, new.city), 300),
        'chamber:' || a.id || ':' || txid_current(), a.slot_start);
    else
      perform public.notify(a.patient_id, 'chamber_removed', 'Chamber removed',
        format('%s removed the chamber “%s” where your visit on %s was booked. Please contact the doctor or reschedule.',
               coalesce(doc_name, 'Your doctor'), old.name, label),
        '/patient/appointments/' || a.id,
        format('The chamber for your visit with %s on %s was removed. Please check your MedLife account.',
               coalesce(doc_name, 'your doctor'), label),
        'chamber-removed:' || a.id, a.slot_start);
    end if;
  end loop;
  return case when tg_op = 'DELETE' then old else null end;
exception when others then
  raise warning 'notify_chamber_change failed: %', sqlerrm;
  return case when tg_op = 'DELETE' then old else null end;
end;
$$;

drop trigger if exists doctor_chambers_notify_update on public.doctor_chambers;
create trigger doctor_chambers_notify_update
  after update on public.doctor_chambers
  for each row execute function public.notify_chamber_change();

-- BEFORE delete: afterwards the appointments' chamber_id is already cleared.
drop trigger if exists doctor_chambers_notify_delete on public.doctor_chambers;
create trigger doctor_chambers_notify_delete
  before delete on public.doctor_chambers
  for each row execute function public.notify_chamber_change();

-- -----------------------------------------------------------------------------
-- Prescription drafts -> patient (at most one "being prepared" note per
-- draft every 30 minutes, so saving often doesn't spam them)
-- -----------------------------------------------------------------------------
create or replace function public.notify_prescription_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rx   public.prescriptions := coalesce(new, old);
  doc  text;
  link text;
begin
  if rx.patient_id is null or rx.status <> 'draft' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    return null;
  end if;
  if not exists (select 1 from public.users u where u.id = rx.patient_id) then
    return null;
  end if;

  select d.display_name into doc from public.doctor_profiles d where d.user_id = rx.doctor_id;
  doc := coalesce(doc, 'Your doctor');
  link := case when rx.appointment_id is not null then '/patient/appointments/' || rx.appointment_id
               else '/patient/prescriptions' end;

  if tg_op = 'DELETE' then
    perform public.notify(rx.patient_id, 'prescription_draft', 'Draft prescription discarded',
      format('%s discarded a draft prescription. You''ll be notified when a prescription is ready.', doc),
      link, null, 'rxdraft:del:' || rx.id);
  else
    perform public.notify(rx.patient_id, 'prescription_draft',
      case when rx.parent_id is null then 'Prescription being prepared' else 'Prescription being updated' end,
      format('%s is %s your prescription. You''ll be notified when it''s signed.', doc,
             case when rx.parent_id is null then 'writing' else 'updating' end),
      link, null,
      'rxdraft:' || rx.id || ':' || floor(extract(epoch from now()) / 1800)::bigint);
  end if;
  return null;
exception when others then
  raise warning 'notify_prescription_draft failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists prescriptions_draft_notify on public.prescriptions;
create trigger prescriptions_draft_notify
  after insert or update or delete on public.prescriptions
  for each row execute function public.notify_prescription_draft();
