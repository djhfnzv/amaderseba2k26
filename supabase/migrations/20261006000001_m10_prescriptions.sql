-- =============================================================================
-- M10. E-Prescription + doctor advice notes
-- Tables: medicines, prescriptions, prescription_items, prescription_tests,
--         prescription_templates, doctor_advice
-- Functions: sign_prescription, amend_prescription, verify_prescription
--
-- * A doctor writes prescriptions for their own patients (any time, linked to
--   an appointment when there is one) or for a manually entered patient.
-- * Drafts are editable; SIGNED prescriptions are locked by triggers.
--   Amending creates a new draft version; signing it marks the old one
--   SUPERSEDED.
-- * Controlled drugs cannot be prescribed in an online consultation.
-- * verify_prescription(code) is public (QR on the PDF) and returns only what
--   a pharmacy needs.
-- Requires: M1-M9.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- medicines (catalogue)
-- -----------------------------------------------------------------------------
create table if not exists public.medicines (
  id            uuid primary key default gen_random_uuid(),
  generic_name  text not null check (char_length(generic_name) between 2 and 200),
  brand_name    text check (char_length(brand_name) <= 120),
  strength      text check (char_length(strength) <= 60),
  form          text not null check (form in (
                  'tablet', 'capsule', 'syrup', 'suspension', 'drops', 'injection', 'cream', 'ointment',
                  'gel', 'lotion', 'inhaler', 'nasal_spray', 'eye_drops', 'ear_drops', 'suppository',
                  'sachet', 'solution', 'other')),
  company       text check (char_length(company) <= 120),
  is_controlled boolean not null default false,
  is_active     boolean not null default true,
  is_custom     boolean not null default false,
  created_by    uuid default auth.uid() references public.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create extension if not exists pg_trgm with schema extensions;
create index if not exists medicines_generic_trgm on public.medicines using gin (generic_name extensions.gin_trgm_ops);
create index if not exists medicines_brand_trgm on public.medicines using gin (brand_name extensions.gin_trgm_ops);
create unique index if not exists medicines_unique_entry
  on public.medicines (lower(generic_name), lower(coalesce(brand_name, '')), lower(coalesce(strength, '')), form)
  where not is_custom;

alter table public.medicines enable row level security;

create policy "signed-in users read medicines" on public.medicines for select to authenticated
  using (is_active and (not is_custom or created_by = auth.uid() or public.is_admin()));
create policy "admins read all medicines" on public.medicines for select to authenticated
  using (public.is_admin());
create policy "doctors add custom medicines" on public.medicines for insert to authenticated
  with check (is_custom and created_by = auth.uid() and public.current_user_role() = 'doctor');
create policy "admins add medicines" on public.medicines for insert to authenticated
  with check (public.is_admin());
create policy "admins update medicines" on public.medicines for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.medicines from anon;
revoke delete on public.medicines from authenticated;
grant select, insert, update on public.medicines to authenticated;

-- -----------------------------------------------------------------------------
-- prescriptions
-- -----------------------------------------------------------------------------
create table if not exists public.prescriptions (
  id               uuid primary key default gen_random_uuid(),
  doctor_id        uuid not null default auth.uid() references public.doctor_profiles (user_id) on delete cascade,
  patient_id       uuid references public.users (id) on delete set null,       -- null = manually entered patient
  appointment_id   uuid references public.appointments (id) on delete set null,
  parent_id        uuid references public.prescriptions (id) on delete set null,
  version          integer not null default 1,
  status           text not null default 'draft' check (status in ('draft', 'signed', 'superseded')),
  verify_code      text unique,
  is_online        boolean not null default false,
  -- Patient details as printed (from the profile or typed by the doctor)
  patient_name     text not null default '' check (char_length(patient_name) <= 120),
  patient_age      text check (char_length(patient_age) <= 20),
  patient_sex      text check (patient_sex in ('male', 'female', 'other')),
  patient_weight   text check (char_length(patient_weight) <= 20),
  patient_phone    text check (char_length(patient_phone) <= 30),
  -- Clinical content
  chief_complaint  text check (char_length(chief_complaint) <= 2000),
  findings         text check (char_length(findings) <= 2000),
  diagnosis        text check (char_length(diagnosis) <= 1000),
  advice           text check (char_length(advice) <= 3000),
  follow_up_date   date,
  follow_up_note   text check (char_length(follow_up_note) <= 300),
  -- Doctor details frozen at signing
  doctor_name      text,
  doctor_degrees   text,
  doctor_license   text,
  doctor_specialty text,
  doctor_chamber   text,
  signed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists prescriptions_doctor_idx on public.prescriptions (doctor_id, created_at desc);
create index if not exists prescriptions_patient_idx on public.prescriptions (patient_id, signed_at desc);
create index if not exists prescriptions_appt_idx on public.prescriptions (appointment_id);

create table if not exists public.prescription_items (
  id              uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  medicine_id     uuid references public.medicines (id) on delete set null,
  medicine_name   text not null check (char_length(medicine_name) between 1 and 200),
  generic_name    text check (char_length(generic_name) <= 200),
  strength        text check (char_length(strength) <= 60),
  form            text check (char_length(form) <= 30),
  dose            text check (char_length(dose) <= 60),
  timing          text check (timing in ('before_meal', 'after_meal', 'with_meal', 'empty_stomach', 'bedtime', 'any')),
  duration        text check (char_length(duration) <= 60),
  instructions    text check (char_length(instructions) <= 300),
  is_controlled   boolean not null default false,
  sort_order      integer not null default 0
);

create table if not exists public.prescription_tests (
  id              uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 150),
  note            text check (char_length(note) <= 200),
  sort_order      integer not null default 0
);

create index if not exists prescription_items_rx_idx on public.prescription_items (prescription_id, sort_order);
create index if not exists prescription_tests_rx_idx on public.prescription_tests (prescription_id, sort_order);

drop trigger if exists prescriptions_set_updated_at on public.prescriptions;
create trigger prescriptions_set_updated_at
  before update on public.prescriptions
  for each row execute function public.set_updated_at();

-- Signed prescriptions are immutable (only signed -> superseded is allowed,
-- and only by the amend/sign functions).
create or replace function public.guard_prescription_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Signed prescriptions cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.status = 'draft' then
    -- Drafts can't be flipped to signed by a plain update; use sign_prescription().
    if new.status <> 'draft' and current_user = 'authenticated' then
      raise exception 'Use Sign to finalise a prescription' using errcode = '42501';
    end if;
    return new;
  end if;
  -- Foreign keys clearing a link (patient/appointment account deleted) may
  -- null those columns; the prescription itself is kept.
  if pg_trigger_depth() > 1
     and (to_jsonb(new) - 'patient_id' - 'appointment_id' - 'parent_id' - 'updated_at')
       = (to_jsonb(old) - 'patient_id' - 'appointment_id' - 'parent_id' - 'updated_at') then
    return new;
  end if;
  -- signed -> superseded, only from sign_prescription() (runs as the owner),
  -- and nothing else on the row may change.
  if old.status = 'signed' and new.status = 'superseded' and current_user <> 'authenticated'
     and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then
    return new;
  end if;
  raise exception 'Signed prescriptions cannot be changed — amend to create a new version' using errcode = '42501';
end;
$$;

drop trigger if exists prescriptions_lock on public.prescriptions;
create trigger prescriptions_lock
  before update or delete on public.prescriptions
  for each row execute function public.guard_prescription_lock();

-- Items/tests only change while their prescription is a draft.
create or replace function public.guard_prescription_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rx uuid := coalesce(new.prescription_id, old.prescription_id);
begin
  if exists (select 1 from public.prescriptions p where p.id = rx and p.status <> 'draft') then
    raise exception 'Signed prescriptions cannot be changed' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  -- The controlled flag comes from the catalogue, not from the client.
  if tg_table_name = 'prescription_items' then
    new.is_controlled := coalesce(
      (select m.is_controlled from public.medicines m where m.id = new.medicine_id), new.is_controlled);
  end if;
  return new;
end;
$$;

drop trigger if exists prescription_items_lock on public.prescription_items;
create trigger prescription_items_lock
  before insert or update or delete on public.prescription_items
  for each row execute function public.guard_prescription_children();
drop trigger if exists prescription_tests_lock on public.prescription_tests;
create trigger prescription_tests_lock
  before insert or update or delete on public.prescription_tests
  for each row execute function public.guard_prescription_children();

-- Links on a draft must point at the doctor's own patient / appointment.
create or replace function public.guard_prescription_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Signed rows are handled by the lock trigger.
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    return new;
  end if;
  if current_user = 'authenticated' then
    if new.patient_id is not null and not public.doctor_has_patient(new.patient_id) then
      raise exception 'You can only prescribe for your own patients' using errcode = '42501';
    end if;
    if new.appointment_id is not null and not exists (
      select 1 from public.appointments a
      where a.id = new.appointment_id and a.doctor_id = auth.uid()
        and (new.patient_id is null or a.patient_id = new.patient_id)
    ) then
      raise exception 'That appointment is not yours' using errcode = '42501';
    end if;
  end if;
  -- Online if linked to an online appointment (controlled-drug rule). Always
  -- derived here so it can't be switched off by a direct update.
  new.is_online := coalesce((
    select a.consultation_type = 'online' from public.appointments a where a.id = new.appointment_id
  ), false);
  return new;
end;
$$;

drop trigger if exists prescriptions_links on public.prescriptions;
create trigger prescriptions_links
  before insert or update on public.prescriptions
  for each row execute function public.guard_prescription_links();

alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.prescription_tests enable row level security;

create policy "doctors read own prescriptions" on public.prescriptions for select to authenticated
  using (doctor_id = auth.uid());
create policy "patients read own signed prescriptions" on public.prescriptions for select to authenticated
  using (patient_id = auth.uid() and status in ('signed', 'superseded'));
create policy "admins read prescriptions" on public.prescriptions for select to authenticated
  using (public.is_admin());
create policy "doctors create drafts" on public.prescriptions for insert to authenticated
  with check (doctor_id = auth.uid() and status = 'draft' and public.current_user_role() = 'doctor');
create policy "doctors edit own drafts" on public.prescriptions for update to authenticated
  using (doctor_id = auth.uid() and status = 'draft') with check (doctor_id = auth.uid());
create policy "doctors delete own drafts" on public.prescriptions for delete to authenticated
  using (doctor_id = auth.uid() and status = 'draft');

-- Children follow the parent's visibility; writes only on the doctor's own drafts.
create policy "read items with prescription" on public.prescription_items for select to authenticated
  using (exists (select 1 from public.prescriptions p where p.id = prescription_id));
create policy "doctors write items on own drafts" on public.prescription_items for all to authenticated
  using (exists (select 1 from public.prescriptions p where p.id = prescription_id and p.doctor_id = auth.uid() and p.status = 'draft'))
  with check (exists (select 1 from public.prescriptions p where p.id = prescription_id and p.doctor_id = auth.uid() and p.status = 'draft'));
create policy "read tests with prescription" on public.prescription_tests for select to authenticated
  using (exists (select 1 from public.prescriptions p where p.id = prescription_id));
create policy "doctors write tests on own drafts" on public.prescription_tests for all to authenticated
  using (exists (select 1 from public.prescriptions p where p.id = prescription_id and p.doctor_id = auth.uid() and p.status = 'draft'))
  with check (exists (select 1 from public.prescriptions p where p.id = prescription_id and p.doctor_id = auth.uid() and p.status = 'draft'));

revoke all on public.prescriptions, public.prescription_items, public.prescription_tests from anon;
grant select, insert, update, delete on public.prescriptions, public.prescription_items, public.prescription_tests to authenticated;

-- -----------------------------------------------------------------------------
-- prescription_templates (doctor's reusable sets)
-- -----------------------------------------------------------------------------
create table if not exists public.prescription_templates (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null default auth.uid() references public.doctor_profiles (user_id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists prescription_templates_doctor_idx on public.prescription_templates (doctor_id, name);

alter table public.prescription_templates enable row level security;
create policy "doctors manage own templates" on public.prescription_templates for all to authenticated
  using (doctor_id = auth.uid()) with check (doctor_id = auth.uid() and public.current_user_role() = 'doctor');
revoke all on public.prescription_templates from anon;
grant select, insert, update, delete on public.prescription_templates to authenticated;

-- -----------------------------------------------------------------------------
-- doctor_advice (advice notes sent without a prescription)
-- -----------------------------------------------------------------------------
create table if not exists public.doctor_advice (
  id             uuid primary key default gen_random_uuid(),
  doctor_id      uuid not null default auth.uid() references public.doctor_profiles (user_id) on delete cascade,
  patient_id     uuid not null references public.users (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  title          text check (char_length(title) <= 120),
  body           text not null check (char_length(trim(body)) between 1 and 5000),
  created_at     timestamptz not null default now()
);

create index if not exists doctor_advice_patient_idx on public.doctor_advice (patient_id, created_at desc);
create index if not exists doctor_advice_appt_idx on public.doctor_advice (appointment_id);

alter table public.doctor_advice enable row level security;
create policy "doctors read own advice" on public.doctor_advice for select to authenticated using (doctor_id = auth.uid());
create policy "patients read their advice" on public.doctor_advice for select to authenticated using (patient_id = auth.uid());
create policy "doctors send advice to own patients" on public.doctor_advice for insert to authenticated
  with check (
    doctor_id = auth.uid()
    and public.doctor_has_patient(patient_id)
    and (appointment_id is null or exists (
      select 1 from public.appointments a where a.id = appointment_id and a.doctor_id = auth.uid() and a.patient_id = doctor_advice.patient_id
    ))
  );
revoke all on public.doctor_advice from anon;
revoke update, delete on public.doctor_advice from authenticated;
grant select, insert on public.doctor_advice to authenticated;

-- -----------------------------------------------------------------------------
-- sign_prescription(): validate, freeze doctor details, lock, issue QR code
-- -----------------------------------------------------------------------------
create or replace function public.sign_prescription(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  rx public.prescriptions;
  dp public.doctor_profiles;
  code text;
  items integer;
begin
  select * into rx from public.prescriptions where id = p_id for update;
  if not found or rx.doctor_id is distinct from auth.uid() then
    raise exception 'Prescription not found' using errcode = 'P0002';
  end if;
  if rx.status <> 'draft' then
    raise exception 'This prescription is already signed' using errcode = '22023';
  end if;
  if not exists (select 1 from public.doctor_profiles d where d.user_id = rx.doctor_id and d.is_verified) then
    raise exception 'Only verified doctors can sign prescriptions' using errcode = '42501';
  end if;
  if trim(rx.patient_name) = '' then
    raise exception 'Enter the patient''s name' using errcode = '22023';
  end if;
  select count(*) into items from public.prescription_items where prescription_id = rx.id;
  if items = 0 and coalesce(trim(rx.advice), '') = '' and not exists (select 1 from public.prescription_tests where prescription_id = rx.id) then
    raise exception 'Add at least one medicine, test or advice' using errcode = '22023';
  end if;
  if rx.is_online and exists (
    select 1 from public.prescription_items i left join public.medicines m on m.id = i.medicine_id
    where i.prescription_id = rx.id and (i.is_controlled or coalesce(m.is_controlled, false))
  ) then
    raise exception 'Controlled drugs cannot be prescribed in an online consultation' using errcode = '22023';
  end if;

  select * into dp from public.doctor_profiles where user_id = rx.doctor_id;
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  -- Freeze who signed and where, then lock (runs as owner, so the lock trigger allows it).
  update public.prescriptions
     set status = 'signed',
         signed_at = now(),
         verify_code = code,
         doctor_name = dp.display_name,
         doctor_license = dp.license_number,
         doctor_degrees = (
           select string_agg(e.degree, ', ' order by e.year nulls last)
           from public.doctor_education e where e.doctor_id = dp.user_id
         ),
         doctor_specialty = coalesce(dp.headline, (
           select string_agg(s.name, ', ' order by ds.is_primary desc, s.name)
           from public.doctor_specialties ds join public.specialties s on s.id = ds.specialty_id
           where ds.doctor_id = dp.user_id
         )),
         doctor_chamber = coalesce(
           (select c.name || ', ' || c.address || ', ' || c.city || coalesce(' · ' || c.phone, '')
              from public.appointments a join public.doctor_chambers c on c.id = a.chamber_id
             where a.id = rx.appointment_id),
           (select c.name || ', ' || c.address || ', ' || c.city || coalesce(' · ' || c.phone, '')
              from public.doctor_chambers c where c.doctor_id = dp.user_id order by c.created_at limit 1)
         )
   where id = rx.id;

  -- Signing an amendment replaces the previous version.
  if rx.parent_id is not null then
    update public.prescriptions set status = 'superseded' where id = rx.parent_id and status = 'signed';
  end if;

  return code;
end;
$$;

-- amend_prescription(): copy a signed prescription into a new draft version
create or replace function public.amend_prescription(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rx public.prescriptions;
  new_id uuid;
begin
  select * into rx from public.prescriptions where id = p_id;
  if not found or rx.doctor_id is distinct from auth.uid() then
    raise exception 'Prescription not found' using errcode = 'P0002';
  end if;
  if rx.status <> 'signed' then
    raise exception 'Only the current signed version can be amended' using errcode = '22023';
  end if;
  -- Reuse an existing open amendment instead of creating another.
  select id into new_id from public.prescriptions where parent_id = rx.id and status = 'draft' limit 1;
  if new_id is not null then
    return new_id;
  end if;

  insert into public.prescriptions (
    doctor_id, patient_id, appointment_id, parent_id, version, status,
    patient_name, patient_age, patient_sex, patient_weight, patient_phone,
    chief_complaint, findings, diagnosis, advice, follow_up_date, follow_up_note
  ) values (
    rx.doctor_id, rx.patient_id, rx.appointment_id, rx.id, rx.version + 1, 'draft',
    rx.patient_name, rx.patient_age, rx.patient_sex, rx.patient_weight, rx.patient_phone,
    rx.chief_complaint, rx.findings, rx.diagnosis, rx.advice, rx.follow_up_date, rx.follow_up_note
  ) returning id into new_id;

  insert into public.prescription_items
    (prescription_id, medicine_id, medicine_name, generic_name, strength, form, dose, timing, duration, instructions, is_controlled, sort_order)
  select new_id, medicine_id, medicine_name, generic_name, strength, form, dose, timing, duration, instructions, is_controlled, sort_order
  from public.prescription_items where prescription_id = rx.id;

  insert into public.prescription_tests (prescription_id, name, note, sort_order)
  select new_id, name, note, sort_order from public.prescription_tests where prescription_id = rx.id;

  return new_id;
end;
$$;

-- verify_prescription(): public QR check — only what a pharmacy needs.
create or replace function public.verify_prescription(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rx public.prescriptions;
  newer timestamptz;
begin
  if p_code is null or p_code !~ '^[A-Z0-9]{10}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into rx from public.prescriptions where verify_code = p_code;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if rx.status = 'superseded' then
    select p.signed_at into newer from public.prescriptions p
     where p.parent_id = rx.id and p.status in ('signed', 'superseded') order by p.signed_at desc limit 1;
  end if;

  return jsonb_build_object(
    'status', case rx.status when 'signed' then 'valid' else 'superseded' end,
    'signed_at', rx.signed_at,
    'replaced_at', newer,
    'doctor_name', rx.doctor_name,
    'doctor_license', rx.doctor_license,
    'doctor_degrees', rx.doctor_degrees,
    -- Initials only: enough to match the paper, not enough to identify online.
    'patient_initials', (select string_agg(upper(left(w, 1)), '. ') || '.' from regexp_split_to_table(trim(rx.patient_name), '\s+') w where w <> ''),
    'patient_age', rx.patient_age,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.medicine_name, 'dose', i.dose, 'duration', i.duration) order by i.sort_order)
      from public.prescription_items i where i.prescription_id = rx.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.sign_prescription(uuid) from public, anon;
revoke execute on function public.amend_prescription(uuid) from public, anon;
grant execute on function public.sign_prescription(uuid) to authenticated;
grant execute on function public.amend_prescription(uuid) to authenticated;
grant execute on function public.verify_prescription(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Starter catalogue: generic name, strength and form only (no brands).
-- Admins can add brands via CSV import on /admin/medicines.
-- -----------------------------------------------------------------------------
insert into public.medicines (generic_name, strength, form)
select g, s, f from (values
  -- Analgesics / antipyretics / NSAIDs
  ('Paracetamol', '500 mg', 'tablet'), ('Paracetamol', '665 mg', 'tablet'), ('Paracetamol', '120 mg/5 ml', 'syrup'),
  ('Paracetamol', '80 mg/ml', 'drops'), ('Paracetamol', '125 mg', 'suppository'), ('Paracetamol', '250 mg', 'suppository'),
  ('Paracetamol + Caffeine', '500 mg + 65 mg', 'tablet'),
  ('Ibuprofen', '200 mg', 'tablet'), ('Ibuprofen', '400 mg', 'tablet'), ('Ibuprofen', '100 mg/5 ml', 'suspension'),
  ('Naproxen', '250 mg', 'tablet'), ('Naproxen', '500 mg', 'tablet'),
  ('Diclofenac sodium', '50 mg', 'tablet'), ('Diclofenac sodium', '100 mg SR', 'tablet'), ('Diclofenac sodium', '75 mg/3 ml', 'injection'),
  ('Diclofenac sodium', '1%', 'gel'), ('Diclofenac sodium', '50 mg', 'suppository'),
  ('Aceclofenac', '100 mg', 'tablet'),
  ('Etoricoxib', '60 mg', 'tablet'), ('Etoricoxib', '90 mg', 'tablet'), ('Etoricoxib', '120 mg', 'tablet'),
  ('Celecoxib', '100 mg', 'capsule'), ('Celecoxib', '200 mg', 'capsule'),
  ('Ketorolac', '10 mg', 'tablet'), ('Ketorolac', '30 mg/ml', 'injection'),
  ('Mefenamic acid', '250 mg', 'capsule'), ('Mefenamic acid', '500 mg', 'tablet'),
  ('Aspirin', '75 mg', 'tablet'), ('Aspirin', '300 mg', 'tablet'),
  -- Antibiotics
  ('Amoxicillin', '250 mg', 'capsule'), ('Amoxicillin', '500 mg', 'capsule'), ('Amoxicillin', '125 mg/5 ml', 'suspension'),
  ('Amoxicillin + Clavulanic acid', '375 mg', 'tablet'), ('Amoxicillin + Clavulanic acid', '625 mg', 'tablet'),
  ('Amoxicillin + Clavulanic acid', '1 g', 'tablet'), ('Amoxicillin + Clavulanic acid', '156.25 mg/5 ml', 'suspension'),
  ('Flucloxacillin', '250 mg', 'capsule'), ('Flucloxacillin', '500 mg', 'capsule'), ('Flucloxacillin', '125 mg/5 ml', 'suspension'),
  ('Cefixime', '200 mg', 'capsule'), ('Cefixime', '400 mg', 'capsule'), ('Cefixime', '100 mg/5 ml', 'suspension'),
  ('Cefuroxime axetil', '250 mg', 'tablet'), ('Cefuroxime axetil', '500 mg', 'tablet'), ('Cefuroxime axetil', '125 mg/5 ml', 'suspension'),
  ('Cefpodoxime', '100 mg', 'tablet'), ('Cefpodoxime', '200 mg', 'tablet'),
  ('Cephradine', '500 mg', 'capsule'), ('Cephradine', '125 mg/5 ml', 'suspension'), ('Cefadroxil', '500 mg', 'capsule'),
  ('Ceftriaxone', '500 mg', 'injection'), ('Ceftriaxone', '1 g', 'injection'), ('Ceftazidime', '1 g', 'injection'),
  ('Azithromycin', '250 mg', 'tablet'), ('Azithromycin', '500 mg', 'tablet'), ('Azithromycin', '200 mg/5 ml', 'suspension'),
  ('Clarithromycin', '250 mg', 'tablet'), ('Clarithromycin', '500 mg', 'tablet'), ('Erythromycin', '500 mg', 'tablet'),
  ('Ciprofloxacin', '250 mg', 'tablet'), ('Ciprofloxacin', '500 mg', 'tablet'), ('Ciprofloxacin', '0.3%', 'eye_drops'),
  ('Levofloxacin', '500 mg', 'tablet'), ('Levofloxacin', '750 mg', 'tablet'),
  ('Moxifloxacin', '400 mg', 'tablet'), ('Moxifloxacin', '0.5%', 'eye_drops'),
  ('Doxycycline', '100 mg', 'capsule'),
  ('Metronidazole', '400 mg', 'tablet'), ('Metronidazole', '200 mg/5 ml', 'suspension'), ('Metronidazole', '500 mg/100 ml', 'injection'),
  ('Tinidazole', '500 mg', 'tablet'),
  ('Nitrofurantoin', '50 mg', 'capsule'), ('Nitrofurantoin', '100 mg', 'capsule'),
  ('Sulfamethoxazole + Trimethoprim', '800 mg + 160 mg', 'tablet'),
  ('Clindamycin', '150 mg', 'capsule'), ('Clindamycin', '300 mg', 'capsule'), ('Clindamycin', '1%', 'gel'),
  ('Linezolid', '600 mg', 'tablet'), ('Meropenem', '1 g', 'injection'),
  ('Gentamicin', '80 mg/2 ml', 'injection'), ('Gentamicin', '0.3%', 'eye_drops'), ('Amikacin', '500 mg/2 ml', 'injection'),
  ('Chloramphenicol', '0.5%', 'eye_drops'), ('Tobramycin', '0.3%', 'eye_drops'), ('Tobramycin + Dexamethasone', '0.3% + 0.1%', 'eye_drops'),
  ('Ofloxacin', '0.3%', 'ear_drops'),
  ('Fusidic acid', '2%', 'cream'), ('Mupirocin', '2%', 'ointment'),
  ('Rifaximin', '200 mg', 'tablet'), ('Rifaximin', '550 mg', 'tablet'),
  ('Rifampicin', '300 mg', 'capsule'), ('Isoniazid', '300 mg', 'tablet'), ('Ethambutol', '400 mg', 'tablet'), ('Pyrazinamide', '500 mg', 'tablet'),
  -- Antifungal / antiviral / antiparasitic
  ('Fluconazole', '50 mg', 'capsule'), ('Fluconazole', '150 mg', 'capsule'), ('Itraconazole', '100 mg', 'capsule'),
  ('Terbinafine', '250 mg', 'tablet'), ('Terbinafine', '1%', 'cream'), ('Clotrimazole', '1%', 'cream'), ('Clotrimazole', '1%', 'ear_drops'),
  ('Miconazole', '2%', 'cream'), ('Miconazole', '2%', 'gel'), ('Ketoconazole', '2%', 'cream'), ('Ketoconazole', '2%', 'lotion'),
  ('Luliconazole', '1%', 'cream'), ('Nystatin', '100,000 IU/ml', 'suspension'), ('Griseofulvin', '500 mg', 'tablet'),
  ('Acyclovir', '200 mg', 'tablet'), ('Acyclovir', '400 mg', 'tablet'), ('Acyclovir', '5%', 'cream'),
  ('Valacyclovir', '500 mg', 'tablet'), ('Valacyclovir', '1 g', 'tablet'), ('Oseltamivir', '75 mg', 'capsule'),
  ('Albendazole', '400 mg', 'tablet'), ('Albendazole', '200 mg/5 ml', 'suspension'), ('Mebendazole', '100 mg', 'tablet'),
  ('Ivermectin', '6 mg', 'tablet'), ('Ivermectin', '12 mg', 'tablet'), ('Nitazoxanide', '500 mg', 'tablet'),
  ('Permethrin', '5%', 'cream'), ('Artemether + Lumefantrine', '20 mg + 120 mg', 'tablet'),
  -- Gastrointestinal
  ('Omeprazole', '20 mg', 'capsule'), ('Omeprazole', '40 mg', 'capsule'), ('Omeprazole', '40 mg', 'injection'),
  ('Esomeprazole', '20 mg', 'tablet'), ('Esomeprazole', '40 mg', 'tablet'), ('Esomeprazole', '40 mg', 'injection'),
  ('Pantoprazole', '20 mg', 'tablet'), ('Pantoprazole', '40 mg', 'tablet'), ('Pantoprazole', '40 mg', 'injection'),
  ('Rabeprazole', '20 mg', 'tablet'), ('Dexlansoprazole', '30 mg', 'capsule'), ('Dexlansoprazole', '60 mg', 'capsule'),
  ('Vonoprazan', '10 mg', 'tablet'), ('Vonoprazan', '20 mg', 'tablet'),
  ('Famotidine', '20 mg', 'tablet'), ('Famotidine', '40 mg', 'tablet'),
  ('Aluminium hydroxide + Magnesium hydroxide', '250 mg + 400 mg/5 ml', 'suspension'),
  ('Sodium alginate + Potassium bicarbonate', '500 mg + 100 mg/5 ml', 'suspension'),
  ('Domperidone', '10 mg', 'tablet'), ('Domperidone', '5 mg/5 ml', 'suspension'),
  ('Ondansetron', '4 mg', 'tablet'), ('Ondansetron', '8 mg', 'tablet'), ('Ondansetron', '4 mg/5 ml', 'syrup'), ('Ondansetron', '8 mg/4 ml', 'injection'),
  ('Metoclopramide', '10 mg', 'tablet'), ('Metoclopramide', '10 mg/2 ml', 'injection'), ('Itopride', '50 mg', 'tablet'),
  ('Hyoscine butylbromide', '10 mg', 'tablet'), ('Hyoscine butylbromide', '20 mg/ml', 'injection'),
  ('Drotaverine', '40 mg', 'tablet'), ('Drotaverine', '80 mg', 'tablet'),
  ('Mebeverine', '135 mg', 'tablet'), ('Mebeverine', '200 mg SR', 'capsule'),
  ('Loperamide', '2 mg', 'capsule'), ('Oral rehydration salts', '10.25 g', 'sachet'),
  ('Zinc sulfate', '20 mg', 'tablet'), ('Zinc sulfate', '10 mg/5 ml', 'syrup'),
  ('Lactulose', '3.35 g/5 ml', 'solution'), ('Bisacodyl', '5 mg', 'tablet'), ('Ispaghula husk', '3.5 g', 'sachet'),
  ('Simethicone', '40 mg/ml', 'drops'), ('Ursodeoxycholic acid', '150 mg', 'tablet'), ('Ursodeoxycholic acid', '300 mg', 'tablet'),
  ('Prochlorperazine', '5 mg', 'tablet'),
  -- Cardiovascular
  ('Amlodipine', '5 mg', 'tablet'), ('Amlodipine', '10 mg', 'tablet'),
  ('Losartan potassium', '25 mg', 'tablet'), ('Losartan potassium', '50 mg', 'tablet'),
  ('Losartan potassium + Hydrochlorothiazide', '50 mg + 12.5 mg', 'tablet'),
  ('Olmesartan', '20 mg', 'tablet'), ('Olmesartan', '40 mg', 'tablet'), ('Telmisartan', '40 mg', 'tablet'), ('Telmisartan', '80 mg', 'tablet'),
  ('Valsartan', '80 mg', 'tablet'), ('Valsartan', '160 mg', 'tablet'), ('Sacubitril + Valsartan', '49 mg + 51 mg', 'tablet'),
  ('Bisoprolol', '2.5 mg', 'tablet'), ('Bisoprolol', '5 mg', 'tablet'), ('Atenolol', '25 mg', 'tablet'), ('Atenolol', '50 mg', 'tablet'),
  ('Metoprolol tartrate', '25 mg', 'tablet'), ('Metoprolol tartrate', '50 mg', 'tablet'),
  ('Carvedilol', '6.25 mg', 'tablet'), ('Carvedilol', '12.5 mg', 'tablet'), ('Propranolol', '10 mg', 'tablet'), ('Propranolol', '40 mg', 'tablet'),
  ('Nebivolol', '5 mg', 'tablet'), ('Ramipril', '2.5 mg', 'tablet'), ('Ramipril', '5 mg', 'tablet'), ('Enalapril', '5 mg', 'tablet'),
  ('Hydrochlorothiazide', '25 mg', 'tablet'), ('Indapamide', '1.5 mg SR', 'tablet'),
  ('Furosemide', '40 mg', 'tablet'), ('Furosemide', '20 mg/2 ml', 'injection'), ('Spironolactone', '25 mg', 'tablet'), ('Spironolactone', '100 mg', 'tablet'),
  ('Atorvastatin', '10 mg', 'tablet'), ('Atorvastatin', '20 mg', 'tablet'), ('Atorvastatin', '40 mg', 'tablet'),
  ('Rosuvastatin', '5 mg', 'tablet'), ('Rosuvastatin', '10 mg', 'tablet'), ('Rosuvastatin', '20 mg', 'tablet'),
  ('Fenofibrate', '160 mg', 'tablet'), ('Ezetimibe', '10 mg', 'tablet'),
  ('Clopidogrel', '75 mg', 'tablet'), ('Ticagrelor', '90 mg', 'tablet'),
  ('Glyceryl trinitrate', '2.6 mg SR', 'tablet'), ('Isosorbide mononitrate', '20 mg', 'tablet'), ('Isosorbide mononitrate', '60 mg SR', 'tablet'),
  ('Trimetazidine', '35 mg MR', 'tablet'), ('Digoxin', '0.25 mg', 'tablet'), ('Warfarin', '5 mg', 'tablet'),
  ('Rivaroxaban', '10 mg', 'tablet'), ('Rivaroxaban', '20 mg', 'tablet'), ('Apixaban', '2.5 mg', 'tablet'), ('Apixaban', '5 mg', 'tablet'),
  ('Amiodarone', '200 mg', 'tablet'), ('Ivabradine', '5 mg', 'tablet'), ('Nifedipine', '20 mg SR', 'tablet'),
  ('Methyldopa', '250 mg', 'tablet'), ('Labetalol', '100 mg', 'tablet'),
  ('Heparin', '5,000 IU/ml', 'injection'), ('Enoxaparin', '40 mg/0.4 ml', 'injection'),
  -- Diabetes
  ('Metformin', '500 mg', 'tablet'), ('Metformin', '850 mg', 'tablet'), ('Metformin', '1000 mg', 'tablet'), ('Metformin', '500 mg XR', 'tablet'),
  ('Gliclazide', '80 mg', 'tablet'), ('Gliclazide', '30 mg MR', 'tablet'), ('Gliclazide', '60 mg MR', 'tablet'),
  ('Glimepiride', '1 mg', 'tablet'), ('Glimepiride', '2 mg', 'tablet'), ('Glimepiride', '4 mg', 'tablet'),
  ('Sitagliptin', '50 mg', 'tablet'), ('Sitagliptin', '100 mg', 'tablet'),
  ('Sitagliptin + Metformin', '50 mg + 500 mg', 'tablet'), ('Sitagliptin + Metformin', '50 mg + 1000 mg', 'tablet'),
  ('Linagliptin', '5 mg', 'tablet'), ('Vildagliptin', '50 mg', 'tablet'),
  ('Empagliflozin', '10 mg', 'tablet'), ('Empagliflozin', '25 mg', 'tablet'), ('Dapagliflozin', '10 mg', 'tablet'),
  ('Pioglitazone', '15 mg', 'tablet'), ('Pioglitazone', '30 mg', 'tablet'),
  ('Insulin regular (soluble)', '100 IU/ml', 'injection'), ('Insulin isophane (NPH)', '100 IU/ml', 'injection'),
  ('Insulin biphasic isophane 30/70', '100 IU/ml', 'injection'), ('Insulin glargine', '100 IU/ml', 'injection'),
  ('Insulin aspart', '100 IU/ml', 'injection'),
  -- Respiratory / allergy
  ('Salbutamol', '2 mg', 'tablet'), ('Salbutamol', '4 mg', 'tablet'), ('Salbutamol', '2 mg/5 ml', 'syrup'),
  ('Salbutamol', '100 mcg/dose', 'inhaler'), ('Salbutamol', '5 mg/ml', 'solution'), ('Ipratropium bromide', '250 mcg/ml', 'solution'),
  ('Salmeterol + Fluticasone propionate', '25 mcg + 125 mcg', 'inhaler'), ('Salmeterol + Fluticasone propionate', '25 mcg + 250 mcg', 'inhaler'),
  ('Formoterol + Budesonide', '4.5 mcg + 160 mcg', 'inhaler'), ('Tiotropium', '18 mcg', 'inhaler'), ('Budesonide', '0.5 mg/2 ml', 'solution'),
  ('Montelukast', '4 mg', 'tablet'), ('Montelukast', '5 mg', 'tablet'), ('Montelukast', '10 mg', 'tablet'), ('Doxofylline', '400 mg', 'tablet'),
  ('Fexofenadine', '120 mg', 'tablet'), ('Fexofenadine', '180 mg', 'tablet'), ('Fexofenadine', '30 mg/5 ml', 'suspension'),
  ('Cetirizine', '10 mg', 'tablet'), ('Cetirizine', '5 mg/5 ml', 'syrup'), ('Levocetirizine', '5 mg', 'tablet'),
  ('Loratadine', '10 mg', 'tablet'), ('Desloratadine', '5 mg', 'tablet'), ('Desloratadine', '2.5 mg/5 ml', 'syrup'),
  ('Rupatadine', '10 mg', 'tablet'), ('Bilastine', '20 mg', 'tablet'),
  ('Chlorphenamine', '4 mg', 'tablet'), ('Chlorphenamine', '2 mg/5 ml', 'syrup'), ('Chlorphenamine', '10 mg/ml', 'injection'),
  ('Promethazine', '10 mg', 'tablet'), ('Promethazine', '25 mg', 'tablet'), ('Ketotifen', '1 mg', 'tablet'),
  ('Ambroxol', '30 mg', 'tablet'), ('Ambroxol', '15 mg/5 ml', 'syrup'), ('Bromhexine', '8 mg', 'tablet'),
  ('Butamirate citrate', '7.5 mg/5 ml', 'syrup'), ('Dextromethorphan', '10 mg/5 ml', 'syrup'), ('Acetylcysteine', '600 mg', 'tablet'),
  ('Fluticasone propionate', '50 mcg/dose', 'nasal_spray'), ('Mometasone furoate', '50 mcg/dose', 'nasal_spray'),
  ('Xylometazoline', '0.1%', 'drops'), ('Oxymetazoline', '0.05%', 'drops'), ('Sodium chloride', '0.9%', 'drops'),
  -- Corticosteroids
  ('Prednisolone', '5 mg', 'tablet'), ('Prednisolone', '10 mg', 'tablet'), ('Prednisolone', '20 mg', 'tablet'),
  ('Dexamethasone', '0.5 mg', 'tablet'), ('Dexamethasone', '4 mg/ml', 'injection'),
  ('Hydrocortisone', '100 mg', 'injection'), ('Hydrocortisone', '1%', 'cream'),
  ('Methylprednisolone', '4 mg', 'tablet'), ('Methylprednisolone', '16 mg', 'tablet'), ('Deflazacort', '6 mg', 'tablet'), ('Deflazacort', '24 mg', 'tablet'),
  ('Betamethasone', '0.1%', 'cream'), ('Clobetasol propionate', '0.05%', 'cream'), ('Clobetasol propionate', '0.05%', 'ointment'),
  ('Mometasone furoate', '0.1%', 'cream'), ('Triamcinolone acetonide', '40 mg/ml', 'injection'),
  -- Vitamins / minerals
  ('Calcium carbonate + Vitamin D3', '500 mg + 200 IU', 'tablet'), ('Cholecalciferol (Vitamin D3)', '20,000 IU', 'capsule'),
  ('Cholecalciferol (Vitamin D3)', '40,000 IU', 'capsule'), ('Ferrous fumarate + Folic acid', '200 mg + 0.2 mg', 'tablet'),
  ('Folic acid', '5 mg', 'tablet'), ('Vitamin B complex', null, 'tablet'), ('Vitamin B1 + B6 + B12', '100 mg + 200 mg + 200 mcg', 'tablet'),
  ('Methylcobalamin', '500 mcg', 'tablet'), ('Ascorbic acid (Vitamin C)', '250 mg', 'tablet'), ('Multivitamin + Minerals', null, 'tablet'),
  ('Potassium chloride', '600 mg SR', 'tablet'), ('Phytomenadione (Vitamin K1)', '10 mg/ml', 'injection'),
  -- Neurology / psychiatry (non-controlled)
  ('Pregabalin', '75 mg', 'capsule'), ('Gabapentin', '300 mg', 'capsule'),
  ('Amitriptyline', '10 mg', 'tablet'), ('Amitriptyline', '25 mg', 'tablet'), ('Nortriptyline', '10 mg', 'tablet'), ('Nortriptyline', '25 mg', 'tablet'),
  ('Sertraline', '50 mg', 'tablet'), ('Escitalopram', '5 mg', 'tablet'), ('Escitalopram', '10 mg', 'tablet'), ('Fluoxetine', '20 mg', 'capsule'),
  ('Duloxetine', '30 mg', 'capsule'), ('Mirtazapine', '15 mg', 'tablet'),
  ('Olanzapine', '5 mg', 'tablet'), ('Olanzapine', '10 mg', 'tablet'), ('Risperidone', '1 mg', 'tablet'), ('Risperidone', '2 mg', 'tablet'),
  ('Quetiapine', '25 mg', 'tablet'), ('Haloperidol', '5 mg', 'tablet'), ('Haloperidol', '5 mg/ml', 'injection'),
  ('Flupentixol + Melitracen', '0.5 mg + 10 mg', 'tablet'),
  ('Levetiracetam', '500 mg', 'tablet'), ('Sodium valproate', '200 mg', 'tablet'), ('Carbamazepine', '200 mg', 'tablet'), ('Phenytoin', '100 mg', 'tablet'),
  ('Flunarizine', '5 mg', 'capsule'), ('Flunarizine', '10 mg', 'capsule'), ('Betahistine', '8 mg', 'tablet'), ('Betahistine', '16 mg', 'tablet'),
  ('Cinnarizine', '25 mg', 'tablet'), ('Levodopa + Carbidopa', '250 mg + 25 mg', 'tablet'),
  ('Tolperisone', '50 mg', 'tablet'), ('Tolperisone', '150 mg', 'tablet'), ('Baclofen', '10 mg', 'tablet'), ('Eperisone', '50 mg', 'tablet'),
  -- Endocrine / urology / gout / women's health
  ('Levothyroxine', '25 mcg', 'tablet'), ('Levothyroxine', '50 mcg', 'tablet'), ('Levothyroxine', '100 mcg', 'tablet'), ('Carbimazole', '5 mg', 'tablet'),
  ('Tamsulosin', '0.4 mg', 'capsule'), ('Solifenacin', '5 mg', 'tablet'), ('Finasteride', '5 mg', 'tablet'),
  ('Allopurinol', '100 mg', 'tablet'), ('Allopurinol', '300 mg', 'tablet'), ('Febuxostat', '40 mg', 'tablet'), ('Febuxostat', '80 mg', 'tablet'),
  ('Colchicine', '0.5 mg', 'tablet'),
  ('Norethisterone', '5 mg', 'tablet'), ('Dydrogesterone', '10 mg', 'tablet'), ('Tranexamic acid', '500 mg', 'tablet'),
  ('Tranexamic acid', '500 mg/5 ml', 'injection'), ('Levonorgestrel + Ethinylestradiol', '0.15 mg + 0.03 mg', 'tablet'),
  -- Eye / skin
  ('Carboxymethylcellulose', '0.5%', 'eye_drops'), ('Timolol', '0.5%', 'eye_drops'), ('Latanoprost', '0.005%', 'eye_drops'),
  ('Olopatadine', '0.1%', 'eye_drops'), ('Prednisolone acetate', '1%', 'eye_drops'),
  ('Calamine', null, 'lotion'), ('Benzoyl peroxide', '2.5%', 'gel'), ('Benzoyl peroxide', '5%', 'gel'), ('Adapalene', '0.1%', 'gel'),
  ('Tretinoin', '0.025%', 'cream'), ('Silver sulfadiazine', '1%', 'cream'), ('Povidone-iodine', '10%', 'solution'),
  -- Emergency / fluids
  ('Adrenaline (Epinephrine)', '1 mg/ml', 'injection'), ('Atropine', '0.6 mg/ml', 'injection'), ('Magnesium sulfate', '50%', 'injection'),
  ('Sodium chloride', '0.9% infusion', 'solution'), ('Dextrose', '5% infusion', 'solution'), ('Ringer''s lactate', 'infusion', 'solution')
) v(g, s, f)
on conflict do nothing;

-- Controlled drugs (blocked in online consultations).
insert into public.medicines (generic_name, strength, form, is_controlled)
select g, s, f, true from (values
  ('Tramadol', '50 mg', 'capsule'), ('Tramadol', '100 mg/2 ml', 'injection'), ('Tapentadol', '50 mg', 'tablet'),
  ('Morphine', '10 mg', 'tablet'), ('Morphine', '10 mg/ml', 'injection'), ('Pethidine', '50 mg/ml', 'injection'),
  ('Pentazocine', '30 mg/ml', 'injection'), ('Fentanyl', '50 mcg/ml', 'injection'), ('Buprenorphine', '0.2 mg', 'tablet'),
  ('Codeine phosphate', '15 mg', 'tablet'),
  ('Diazepam', '5 mg', 'tablet'), ('Diazepam', '10 mg/2 ml', 'injection'), ('Clonazepam', '0.5 mg', 'tablet'), ('Clonazepam', '2 mg', 'tablet'),
  ('Alprazolam', '0.25 mg', 'tablet'), ('Alprazolam', '0.5 mg', 'tablet'), ('Lorazepam', '1 mg', 'tablet'), ('Bromazepam', '3 mg', 'tablet'),
  ('Clobazam', '10 mg', 'tablet'), ('Midazolam', '15 mg', 'tablet'), ('Midazolam', '5 mg/ml', 'injection'),
  ('Chlordiazepoxide + Clidinium', '5 mg + 2.5 mg', 'capsule'), ('Zolpidem', '10 mg', 'tablet'),
  ('Phenobarbital', '30 mg', 'tablet'), ('Phenobarbital', '60 mg', 'tablet'), ('Methylphenidate', '10 mg', 'tablet'),
  ('Ketamine', '50 mg/ml', 'injection')
) v(g, s, f)
on conflict do nothing;
