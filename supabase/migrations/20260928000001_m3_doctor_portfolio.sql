-- =============================================================================
-- M3. Doctor Portfolio
-- Tables: specialties, doctor_profiles, doctor_specialties, doctor_education,
--         doctor_experience, doctor_chambers, doctor_publications, doctor_awards
-- Storage: public bucket "doctor-photos", objects stored as <user_id>/<uuid>.<ext>
--
-- Visibility: a portfolio (and everything under it) is public only when the
-- doctor is verified AND their account is active. The doctor can always see
-- and edit their own; admins can see all. Verification itself (documents,
-- approve/reject) is M4 — until then use supabase/seed/verify_doctor.sql.
-- Requires: M1 (users, is_admin, current_user_role), M2 (set_updated_at).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- specialties (catalogue, managed by admins in M13)
-- -----------------------------------------------------------------------------
create table if not exists public.specialties (
  id          smallint generated always as identity primary key,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null unique check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 200),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.specialties (slug, name, description) values
  ('medicine',           'Medicine',                 'General & internal medicine'),
  ('cardiology',         'Cardiology',               'Heart & blood pressure'),
  ('pediatrics',         'Pediatrics',               'Child health'),
  ('gynecology',         'Gynecology & Obstetrics',  'Women''s health & pregnancy'),
  ('dermatology',        'Dermatology',              'Skin, hair & nails'),
  ('orthopedics',        'Orthopedics',              'Bones, joints & spine'),
  ('psychiatry',         'Psychiatry',               'Mental health'),
  ('ent',                'ENT',                      'Ear, nose & throat'),
  ('neurology',          'Neurology',                'Brain & nerves'),
  ('gastroenterology',   'Gastroenterology',         'Stomach & digestion'),
  ('endocrinology',      'Endocrinology',            'Diabetes & hormones'),
  ('dentistry',          'Dentistry',                'Teeth & oral care'),
  ('ophthalmology',      'Ophthalmology',            'Eyes & vision'),
  ('urology',            'Urology',                  'Urinary tract & male health'),
  ('nephrology',         'Nephrology',               'Kidneys'),
  ('pulmonology',        'Pulmonology',              'Lungs & breathing'),
  ('oncology',           'Oncology',                 'Cancer care'),
  ('general-surgery',    'General Surgery',          'Surgical care'),
  ('rheumatology',       'Rheumatology',             'Arthritis & autoimmune conditions'),
  ('physical-medicine',  'Physical Medicine',        'Rehabilitation & physiotherapy')
on conflict (slug) do nothing;

alter table public.specialties enable row level security;

create policy "specialties are readable by everyone"
  on public.specialties for select
  using (true);

grant select on public.specialties to anon, authenticated;

-- -----------------------------------------------------------------------------
-- doctor_profiles
-- -----------------------------------------------------------------------------
create table if not exists public.doctor_profiles (
  user_id             uuid primary key references public.users (id) on delete cascade,
  slug                text not null unique
                      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  display_name        text not null check (char_length(display_name) between 2 and 120),
  headline            text check (char_length(headline) <= 120),
  bio                 text check (char_length(bio) <= 3000),
  photo_path          text,
  license_number      text check (char_length(license_number) <= 50),
  practice_since_year smallint check (practice_since_year between 1950 and 2100),
  languages           text[] not null default '{}' check (cardinality(languages) <= 10),
  offers_online       boolean not null default false,
  offers_in_person    boolean not null default false,
  fee_online          numeric(10, 2) check (fee_online >= 0),
  fee_in_person       numeric(10, 2) check (fee_in_person >= 0),
  is_verified         boolean not null default false,
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint doctor_profiles_online_fee check (not offers_online or fee_online is not null),
  constraint doctor_profiles_in_person_fee check (not offers_in_person or fee_in_person is not null),
  constraint doctor_profiles_photo_owner check (photo_path is null or photo_path like user_id::text || '/%')
);

drop trigger if exists doctor_profiles_set_updated_at on public.doctor_profiles;
create trigger doctor_profiles_set_updated_at
  before update on public.doctor_profiles
  for each row execute function public.set_updated_at();

-- Doctors cannot verify themselves; only admins (or SQL/service role) can.
create or replace function public.guard_doctor_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_verified := false;
      new.verified_at := null;
    elsif new.is_verified is distinct from old.is_verified
       or new.verified_at is distinct from old.verified_at then
      raise exception 'Only an admin can change verification status'
        using errcode = '42501';
    end if;
  end if;

  if new.is_verified and new.verified_at is null then
    new.verified_at := now();
  elsif not new.is_verified then
    new.verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists doctor_profiles_guard_verification on public.doctor_profiles;
create trigger doctor_profiles_guard_verification
  before insert or update on public.doctor_profiles
  for each row execute function public.guard_doctor_verification();

-- True when a doctor's portfolio may be shown to the public.
-- SECURITY DEFINER: anon cannot read public.users, but may learn this boolean.
create or replace function public.doctor_is_public(doctor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.doctor_profiles dp
    join public.users u on u.id = dp.user_id
    where dp.user_id = doctor
      and dp.is_verified
      and u.status = 'active'
      and u.role = 'doctor'
  );
$$;

revoke execute on function public.doctor_is_public(uuid) from public;
grant execute on function public.doctor_is_public(uuid) to anon, authenticated;

alter table public.doctor_profiles enable row level security;

create policy "public can read verified doctor profiles"
  on public.doctor_profiles for select
  to anon, authenticated
  using (public.doctor_is_public(user_id));

create policy "doctors can read own profile"
  on public.doctor_profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy "admins can read all doctor profiles"
  on public.doctor_profiles for select
  to authenticated
  using (public.is_admin());

create policy "doctors can create own profile"
  on public.doctor_profiles for insert
  to authenticated
  with check (user_id = auth.uid() and public.current_user_role() = 'doctor');

create policy "doctors can update own profile"
  on public.doctor_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "admins can update doctor profiles"
  on public.doctor_profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.doctor_profiles from anon;
grant select on public.doctor_profiles to anon;
revoke delete on public.doctor_profiles from authenticated;
grant select, insert, update on public.doctor_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Portfolio detail tables. All share the same access pattern:
--   read: public if doctor_is_public, own, or admin
--   write: own rows only
-- -----------------------------------------------------------------------------
create table if not exists public.doctor_specialties (
  doctor_id    uuid not null references public.doctor_profiles (user_id) on delete cascade,
  specialty_id smallint not null references public.specialties (id) on delete restrict,
  is_primary   boolean not null default false,
  primary key (doctor_id, specialty_id)
);
create index if not exists doctor_specialties_specialty_idx on public.doctor_specialties (specialty_id);

create table if not exists public.doctor_education (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   uuid not null default auth.uid() references public.doctor_profiles (user_id) on delete cascade,
  degree      text not null check (char_length(degree) between 1 and 120),
  institution text not null check (char_length(institution) between 1 and 200),
  year        smallint check (year between 1950 and 2100),
  created_at  timestamptz not null default now()
);

create table if not exists public.doctor_experience (
  id           uuid primary key default gen_random_uuid(),
  doctor_id    uuid not null default auth.uid() references public.doctor_profiles (user_id) on delete cascade,
  position     text not null check (char_length(position) between 1 and 120),
  organization text not null check (char_length(organization) between 1 and 200),
  start_year   smallint not null check (start_year between 1950 and 2100),
  end_year     smallint check (end_year between 1950 and 2100),
  created_at   timestamptz not null default now(),
  constraint doctor_experience_years check (end_year is null or end_year >= start_year)
);

create table if not exists public.doctor_chambers (
  id             uuid primary key default gen_random_uuid(),
  doctor_id      uuid not null default auth.uid() references public.doctor_profiles (user_id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 150),
  address        text not null check (char_length(address) between 1 and 300),
  city           text not null check (char_length(city) between 1 and 80),
  visiting_hours text check (char_length(visiting_hours) <= 150),
  phone          text check (char_length(phone) <= 30),
  created_at     timestamptz not null default now()
);

create table if not exists public.doctor_publications (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null default auth.uid() references public.doctor_profiles (user_id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 300),
  publisher  text check (char_length(publisher) <= 200),
  year       smallint check (year between 1950 and 2100),
  url        text check (char_length(url) <= 500 and url ~ '^https?://'),
  created_at timestamptz not null default now()
);

create table if not exists public.doctor_awards (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null default auth.uid() references public.doctor_profiles (user_id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  issuer     text check (char_length(issuer) <= 200),
  year       smallint check (year between 1950 and 2100),
  created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'doctor_specialties', 'doctor_education', 'doctor_experience',
    'doctor_chambers', 'doctor_publications', 'doctor_awards'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy "read public, own or admin" on public.%I for select to anon, authenticated
         using (public.doctor_is_public(doctor_id) or doctor_id = auth.uid() or public.is_admin())', t);
    execute format(
      'create policy "doctors insert own" on public.%I for insert to authenticated
         with check (doctor_id = auth.uid())', t);
    execute format(
      'create policy "doctors update own" on public.%I for update to authenticated
         using (doctor_id = auth.uid()) with check (doctor_id = auth.uid())', t);
    execute format(
      'create policy "doctors delete own" on public.%I for delete to authenticated
         using (doctor_id = auth.uid())', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

create index if not exists doctor_education_doctor_idx on public.doctor_education (doctor_id);
create index if not exists doctor_experience_doctor_idx on public.doctor_experience (doctor_id);
create index if not exists doctor_chambers_doctor_idx on public.doctor_chambers (doctor_id);
create index if not exists doctor_publications_doctor_idx on public.doctor_publications (doctor_id);
create index if not exists doctor_awards_doctor_idx on public.doctor_awards (doctor_id);

-- -----------------------------------------------------------------------------
-- Storage: public bucket for portfolio photos
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('doctor-photos', 'doctor-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "doctors can upload own photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'doctor-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_role() = 'doctor'
  );

create policy "doctors can read own photo objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'doctor-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "doctors can delete own photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'doctor-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
