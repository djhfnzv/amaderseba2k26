-- =============================================================================
-- M9. Video consultation (peer-to-peer WebRTC)
-- Tables: consultations, consultation_messages
-- Storage: private bucket "consultation-files" (<appointment_id>/<uuid>.<ext>)
-- Realtime: private broadcast channel "consult:<appointment_id>" for WebRTC
--           signaling, restricted to that appointment's doctor and patient.
-- Functions: open_consultation, end_consultation, save_consultation_notes
--
-- Room window: opens 10 min before the slot, closes when the doctor ends the
-- consultation or 30 min after the scheduled end. Audio/video go directly
-- between the two browsers (DTLS-SRTP encrypted); only chat, files and the
-- doctor's notes are stored.
-- Requires: M7 (appointments, appointment_events), M8.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- Caller is the doctor or patient of this appointment.
create or replace function public.consultation_participant(p_appointment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.appointments a
    where a.id = p_appointment and auth.uid() in (a.doctor_id, a.patient_id)
  );
$$;

-- -----------------------------------------------------------------------------
-- consultations (one per online appointment)
-- -----------------------------------------------------------------------------
create table if not exists public.consultations (
  id               uuid primary key default gen_random_uuid(),
  appointment_id   uuid not null unique references public.appointments (id) on delete cascade,
  doctor_id        uuid not null references public.doctor_profiles (user_id) on delete cascade,
  patient_id       uuid not null references public.users (id) on delete cascade,
  status           text not null default 'waiting' check (status in ('waiting', 'live', 'ended')),
  started_at       timestamptz,
  ended_at         timestamptz,
  notes            text check (char_length(notes) <= 10000),
  notes_updated_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists consultations_set_updated_at on public.consultations;
create trigger consultations_set_updated_at
  before update on public.consultations
  for each row execute function public.set_updated_at();

-- The room is open for chat/files right now (needs the table above).
create or replace function public.consultation_is_open(p_appointment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments a
    left join public.consultations c on c.appointment_id = a.id
    where a.id = p_appointment
      and a.consultation_type = 'online'
      and a.status in ('confirmed', 'in_progress')
      and coalesce(c.status, 'waiting') <> 'ended'
      and now() between a.slot_start - interval '10 minutes' and a.slot_end + interval '30 minutes'
  );
$$;

alter table public.consultations enable row level security;

-- Notes are the doctor's clinical notes: only the doctor reads this table.
create policy "doctors read own consultations" on public.consultations for select to authenticated
  using (doctor_id = auth.uid());

revoke all on public.consultations from anon;
revoke insert, update, delete on public.consultations from authenticated;
grant select on public.consultations to authenticated;

-- -----------------------------------------------------------------------------
-- consultation_messages (chat + shared files, kept with the appointment)
-- -----------------------------------------------------------------------------
create table if not exists public.consultation_messages (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  sender_id      uuid not null default auth.uid() references public.users (id) on delete cascade,
  kind           text not null check (kind in ('text', 'file')),
  body           text check (char_length(body) <= 2000),
  file_path      text,
  file_name      text check (char_length(file_name) <= 255),
  mime_type      text check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes     integer check (size_bytes > 0 and size_bytes <= 10485760),
  created_at     timestamptz not null default now(),
  constraint consultation_messages_shape check (
    (kind = 'text' and body is not null and char_length(trim(body)) > 0 and file_path is null)
    or (kind = 'file' and file_path is not null and file_name is not null and mime_type is not null and size_bytes is not null)
  ),
  constraint consultation_messages_path check (file_path is null or file_path like appointment_id::text || '/%')
);

create index if not exists consultation_messages_appt_idx on public.consultation_messages (appointment_id, created_at);

alter table public.consultation_messages enable row level security;

create policy "participants read messages" on public.consultation_messages for select to authenticated
  using (public.consultation_participant(appointment_id));
create policy "participants send messages while open" on public.consultation_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.consultation_participant(appointment_id)
    and public.consultation_is_open(appointment_id)
  );

revoke all on public.consultation_messages from anon;
revoke update, delete on public.consultation_messages from authenticated;
grant select, insert on public.consultation_messages to authenticated;

-- -----------------------------------------------------------------------------
-- open_consultation(): called when someone opens the room.
-- Returns the room state; the doctor joining starts the appointment.
-- -----------------------------------------------------------------------------
create or replace function public.open_consultation(p_appointment uuid)
returns table (
  consultation_id uuid,
  role            text,
  room_status     text,   -- 'not_open' | 'open' | 'closed' | 'ended'
  opens_at        timestamptz,
  closes_at       timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  a public.appointments;
  c public.consultations;
  my_role text;
  opens timestamptz;
  closes timestamptz;
begin
  select * into a from public.appointments where id = p_appointment for update;
  if not found or me is null or me not in (a.doctor_id, a.patient_id) then
    raise exception 'Consultation not found' using errcode = 'P0002';
  end if;
  if a.consultation_type <> 'online' then
    raise exception 'This is an in-person appointment' using errcode = '22023';
  end if;
  if a.status = 'pending_payment' then
    raise exception 'Please complete the payment to join this consultation' using errcode = '22023';
  end if;
  if a.status not in ('confirmed', 'in_progress', 'completed') then
    raise exception 'This appointment is not active' using errcode = '22023';
  end if;

  my_role := case when me = a.doctor_id then 'doctor' else 'patient' end;
  opens := a.slot_start - interval '10 minutes';
  closes := a.slot_end + interval '30 minutes';

  insert into public.consultations (appointment_id, doctor_id, patient_id)
  values (a.id, a.doctor_id, a.patient_id)
  on conflict (appointment_id) do nothing;
  select * into c from public.consultations where appointment_id = a.id for update;

  if c.status = 'ended' or a.status = 'completed' then
    return query select c.id, my_role, 'ended'::text, opens, closes;
    return;
  end if;
  if now() < opens then
    return query select c.id, my_role, 'not_open'::text, opens, closes;
    return;
  end if;
  if now() > closes then
    return query select c.id, my_role, 'closed'::text, opens, closes;
    return;
  end if;

  -- The doctor arriving starts the consultation.
  if my_role = 'doctor' then
    if a.status = 'confirmed' then
      update public.appointments set status = 'in_progress' where id = a.id;
      insert into public.appointment_events (appointment_id, action, actor_id, note)
      values (a.id, 'started', me, 'Video consultation started');
    end if;
    update public.consultations
       set status = 'live', started_at = coalesce(started_at, now())
     where id = c.id;
  end if;

  return query select c.id, my_role, 'open'::text, opens, closes;
end;
$$;

-- Doctor ends the consultation: room closes and the appointment is completed.
create or replace function public.end_consultation(p_appointment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.appointments;
begin
  select * into a from public.appointments where id = p_appointment for update;
  if not found or a.doctor_id is distinct from auth.uid() then
    raise exception 'Consultation not found' using errcode = 'P0002';
  end if;

  update public.consultations
     set status = 'ended', ended_at = coalesce(ended_at, now())
   where appointment_id = a.id;

  if a.status in ('confirmed', 'in_progress') then
    update public.appointments set status = 'completed' where id = a.id;
    insert into public.appointment_events (appointment_id, action, actor_id, note)
    values (a.id, 'completed', auth.uid(), 'Video consultation ended');
  end if;
end;
$$;

-- Doctor's notes (autosaved during and after the call).
create or replace function public.save_consultation_notes(p_appointment uuid, p_notes text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved timestamptz := now();
begin
  if char_length(coalesce(p_notes, '')) > 10000 then
    raise exception 'Notes are limited to 10,000 characters' using errcode = '22023';
  end if;
  update public.consultations
     set notes = nullif(p_notes, ''), notes_updated_at = saved
   where appointment_id = p_appointment and doctor_id = auth.uid();
  if not found then
    raise exception 'Consultation not found' using errcode = 'P0002';
  end if;
  return saved;
end;
$$;

revoke execute on function public.consultation_participant(uuid) from public, anon;
revoke execute on function public.consultation_is_open(uuid) from public, anon;
revoke execute on function public.open_consultation(uuid) from public, anon;
revoke execute on function public.end_consultation(uuid) from public, anon;
revoke execute on function public.save_consultation_notes(uuid, text) from public, anon;
grant execute on function public.consultation_participant(uuid) to authenticated;
grant execute on function public.consultation_is_open(uuid) to authenticated;
grant execute on function public.open_consultation(uuid) to authenticated;
grant execute on function public.end_consultation(uuid) to authenticated;
grant execute on function public.save_consultation_notes(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: files shared during the call
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consultation-files', 'consultation-files', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Folder name is the appointment id; checked as text so odd names can't break the cast.
create or replace function public.consultation_folder_ok(p_folder text, p_require_open boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.consultation_participant(p_folder::uuid)
     and (not p_require_open or public.consultation_is_open(p_folder::uuid));
end;
$$;

revoke execute on function public.consultation_folder_ok(text, boolean) from public, anon;
grant execute on function public.consultation_folder_ok(text, boolean) to authenticated;

create policy "participants upload consultation files" on storage.objects for insert to authenticated
  with check (bucket_id = 'consultation-files' and public.consultation_folder_ok((storage.foldername(name))[1], true));
create policy "participants read consultation files" on storage.objects for select to authenticated
  using (bucket_id = 'consultation-files' and public.consultation_folder_ok((storage.foldername(name))[1], false));

-- -----------------------------------------------------------------------------
-- Realtime Authorization: private channel "consult:<appointment_id>"
-- Only the appointment's doctor and patient may send/receive on it.
-- -----------------------------------------------------------------------------
create or replace function public.can_use_consult_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_topic !~ '^consult:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.consultation_participant(substr(p_topic, 9)::uuid);
end;
$$;

revoke execute on function public.can_use_consult_topic(text) from public, anon;
grant execute on function public.can_use_consult_topic(text) to authenticated;

drop policy if exists "consult participants receive" on realtime.messages;
create policy "consult participants receive" on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.can_use_consult_topic(realtime.topic())
  );

drop policy if exists "consult participants send" on realtime.messages;
create policy "consult participants send" on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.can_use_consult_topic(realtime.topic())
  );
