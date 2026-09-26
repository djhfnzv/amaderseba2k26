-- =============================================================================
-- M1. Authentication & Role Management
-- Tables: roles, users
--
-- * auth.users (managed by Supabase Auth) holds credentials.
-- * public.users mirrors each auth user with an application role + status.
-- * role/status are also copied into auth.users.raw_app_meta_data so they are
--   in the JWT (app_metadata) for cheap route checks in src/proxy.ts.
--   Users cannot edit app_metadata; public.users stays the source of truth.
-- * Self sign-up can only produce 'patient' or 'doctor'. Admins are promoted
--   manually (supabase/seed/promote_admin.sql).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- roles (lookup)
-- -----------------------------------------------------------------------------
create table if not exists public.roles (
  id          text primary key,
  description text not null
);

insert into public.roles (id, description) values
  ('patient', 'Registered patient. Books appointments, attends consultations, views prescriptions.'),
  ('doctor',  'Medical professional. Manages portfolio, schedule, consultations, prescriptions.'),
  ('admin',   'Platform operator. Verifies doctors, manages users, payments, reports.')
on conflict (id) do nothing;

alter table public.roles enable row level security;

create policy "roles are readable by everyone"
  on public.roles for select
  using (true);

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
create type public.account_status as enum ('active', 'suspended');

create table if not exists public.users (
  id               uuid primary key references auth.users (id) on delete cascade,
  role             text not null default 'patient' references public.roles (id),
  full_name        text not null default '',
  email            text unique,
  phone            text unique,
  avatar_url       text,
  status           public.account_status not null default 'active',
  suspended_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists users_role_idx on public.users (role);

-- -----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so RLS policies can use them without
-- recursing into public.users policies)
-- -----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users u where u.id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'
  );
$$;

revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- auth.users BEFORE INSERT: stamp role/status into app_metadata
-- -----------------------------------------------------------------------------
create or replace function public.handle_auth_user_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
begin
  -- Only patient/doctor may be self-selected; anything else becomes patient.
  if requested_role is null or requested_role not in ('patient', 'doctor') then
    requested_role := 'patient';
  end if;

  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', requested_role, 'status', 'active');

  return new;
end;
$$;

drop trigger if exists on_auth_user_before_insert on auth.users;
create trigger on_auth_user_before_insert
  before insert on auth.users
  for each row execute function public.handle_auth_user_before_insert();

-- -----------------------------------------------------------------------------
-- auth.users AFTER INSERT: create the public.users row
-- -----------------------------------------------------------------------------
create or replace function public.handle_auth_user_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, role, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_app_meta_data ->> 'role', 'patient'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.email, ''),
    nullif(new.phone, '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user_after_insert();

-- -----------------------------------------------------------------------------
-- auth.users AFTER UPDATE: keep email/phone in sync
-- -----------------------------------------------------------------------------
create or replace function public.handle_auth_user_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
     set email = nullif(new.email, ''),
         phone = nullif(new.phone, '')
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, phone on auth.users
  for each row
  when (new.email is distinct from old.email or new.phone is distinct from old.phone)
  execute function public.handle_auth_user_after_update();

-- -----------------------------------------------------------------------------
-- public.users BEFORE UPDATE guard
-- * Normal users cannot change role, status, email, phone or id.
-- * Nobody (incl. admins) can change their own role/status via the API.
-- * Maintains updated_at.
-- -----------------------------------------------------------------------------
create or replace function public.guard_users_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if not public.is_admin() and (
         new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.suspended_reason is distinct from old.suspended_reason
      or new.email is distinct from old.email
      or new.phone is distinct from old.phone
    ) then
      raise exception 'You are not allowed to change these fields'
        using errcode = '42501';
    end if;

    if new.id = auth.uid()
       and (new.role is distinct from old.role or new.status is distinct from old.status) then
      raise exception 'You cannot change your own role or status'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists users_guard_update on public.users;
create trigger users_guard_update
  before update on public.users
  for each row execute function public.guard_users_update();

-- -----------------------------------------------------------------------------
-- public.users AFTER UPDATE of role/status: sync JWT app_metadata
-- -----------------------------------------------------------------------------
create or replace function public.sync_user_claims()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('role', new.role, 'status', new.status::text)
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists users_sync_claims on public.users;
create trigger users_sync_claims
  after update of role, status on public.users
  for each row
  when (new.role is distinct from old.role or new.status is distinct from old.status)
  execute function public.sync_user_claims();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.users enable row level security;

create policy "users can read own row"
  on public.users for select
  to authenticated
  using (id = auth.uid());

create policy "admins can read all users"
  on public.users for select
  to authenticated
  using (public.is_admin());

create policy "users can update own row"
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "admins can update any user"
  on public.users for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No INSERT/DELETE policies: rows are created by trigger and removed by
-- cascade from auth.users.
revoke all on public.users from anon;
revoke insert, delete on public.users from authenticated;
grant select, update on public.users to authenticated;
