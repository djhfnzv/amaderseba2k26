-- =============================================================================
-- M2. Patient Profile & Medical Records
-- Tables: patient_profiles, medical_files
-- Storage: private bucket "medical-files", objects stored as <user_id>/<uuid>.<ext>
--
-- Access (this module): a patient can only read/write their own profile and
-- files. Doctor read access for booked patients is added in M7 (appointments).
-- Access logging is added in M14.
-- Requires: M1 (public.users, public.current_user_role()).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Generic updated_at trigger (reused by later modules)
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- patient_profiles
-- -----------------------------------------------------------------------------
create table if not exists public.patient_profiles (
  user_id                 uuid primary key references public.users (id) on delete cascade,
  date_of_birth           date check (date_of_birth between date '1900-01-01' and current_date),
  sex                     text check (sex in ('male', 'female', 'other')),
  weight_kg               numeric(5, 1) check (weight_kg > 0 and weight_kg <= 500),
  height_cm               numeric(5, 1) check (height_cm > 0 and height_cm <= 300),
  blood_group             text check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  allergies               text[] not null default '{}'
                          check (cardinality(allergies) <= 30),
  chronic_conditions      text[] not null default '{}'
                          check (cardinality(chronic_conditions) <= 30),
  emergency_contact_name  text check (char_length(emergency_contact_name) <= 120),
  emergency_contact_phone text check (char_length(emergency_contact_phone) <= 30),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

drop trigger if exists patient_profiles_set_updated_at on public.patient_profiles;
create trigger patient_profiles_set_updated_at
  before update on public.patient_profiles
  for each row execute function public.set_updated_at();

alter table public.patient_profiles enable row level security;

create policy "patients can read own profile"
  on public.patient_profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy "patients can create own profile"
  on public.patient_profiles for insert
  to authenticated
  with check (user_id = auth.uid() and public.current_user_role() = 'patient');

create policy "patients can update own profile"
  on public.patient_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.patient_profiles from anon;
revoke delete on public.patient_profiles from authenticated;
grant select, insert, update on public.patient_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- medical_files
-- -----------------------------------------------------------------------------
create table if not exists public.medical_files (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null default auth.uid() references public.users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  category     text not null default 'other'
               check (category in ('lab_report', 'imaging', 'prescription', 'discharge_summary', 'other')),
  report_date  date check (report_date between date '1900-01-01' and current_date),
  notes        text check (char_length(notes) <= 1000),
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) <= 255),
  mime_type    text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes   integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at   timestamptz not null default now(),
  -- The file must live in the owner's own storage folder.
  constraint medical_files_path_owner check (storage_path like patient_id::text || '/%')
);

create index if not exists medical_files_patient_idx
  on public.medical_files (patient_id, created_at desc);

alter table public.medical_files enable row level security;

create policy "patients can read own files"
  on public.medical_files for select
  to authenticated
  using (patient_id = auth.uid());

create policy "patients can add own files"
  on public.medical_files for insert
  to authenticated
  with check (patient_id = auth.uid() and public.current_user_role() = 'patient');

create policy "patients can delete own files"
  on public.medical_files for delete
  to authenticated
  using (patient_id = auth.uid());

revoke all on public.medical_files from anon;
revoke update on public.medical_files from authenticated;
grant select, insert, delete on public.medical_files to authenticated;

-- -----------------------------------------------------------------------------
-- Storage bucket (private) + policies
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medical-files',
  'medical-files',
  false,
  10485760, -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "patients can upload to own medical folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'medical-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_role() = 'patient'
  );

create policy "patients can read own medical files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'medical-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "patients can delete own medical files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'medical-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
