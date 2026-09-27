-- =============================================================================
-- M13 (basic). Admin user management
-- Table: admin_actions (audit trail of admin decisions on accounts)
-- Function: admin_set_user_status()
--
-- Suspending an account:
--   * sets users.status = 'suspended' (+ reason shown to the user); the M1
--     trigger mirrors it into the JWT, and every page re-checks the DB,
--   * cancels the user's upcoming live appointments (patients see a neutral
--     message, never the admin's reason) and drops their slot holds,
--   * a suspended doctor disappears from search/public pages automatically
--     (doctor_is_public() requires an active account).
-- Admins cannot suspend themselves or other admins.
-- Requires: M1 (users, is_admin), M7 (appointments, slot_holds, appointment_events).
-- =============================================================================

create table if not exists public.admin_actions (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid references public.users (id) on delete set null,
  target_user_id uuid not null references public.users (id) on delete cascade,
  action         text not null check (action in ('suspended', 'reactivated')),
  reason         text check (char_length(reason) <= 1000),
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_actions_target_idx on public.admin_actions (target_user_id, created_at desc);

alter table public.admin_actions enable row level security;

create policy "admins read admin actions" on public.admin_actions for select to authenticated
  using (public.is_admin());

revoke all on public.admin_actions from anon;
revoke insert, update, delete on public.admin_actions from authenticated;
grant select on public.admin_actions to authenticated;

-- -----------------------------------------------------------------------------
-- admin_set_user_status(user, 'suspended' | 'active', reason)
-- Returns the number of upcoming appointments that were cancelled.
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_user_status(
  p_user   uuid,
  p_status text,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target public.users;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
  cancelled integer := 0;
  appt record;
  patient_msg constant text := 'The doctor is not available on MedLife at the moment. We are sorry for the inconvenience — please book another doctor.';
  doctor_msg  constant text := 'The patient''s account is no longer active.';
begin
  if not public.is_admin() then
    raise exception 'Only admins can change account status' using errcode = '42501';
  end if;
  if p_status not in ('suspended', 'active') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  if p_user = me then
    raise exception 'You cannot change your own account status' using errcode = '22023';
  end if;

  select * into target from public.users where id = p_user for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if target.role = 'admin' then
    raise exception 'Admin accounts cannot be suspended here' using errcode = '22023';
  end if;
  if target.status::text = p_status then
    raise exception 'The account is already %', case p_status when 'active' then 'active' else 'suspended' end
      using errcode = '22023';
  end if;
  if p_status = 'suspended' and (reason is null or char_length(reason) < 10) then
    raise exception 'Please give a reason (at least 10 characters)' using errcode = '22023';
  end if;

  update public.users
     set status = p_status::public.account_status,
         suspended_reason = case when p_status = 'suspended' then reason else null end
   where id = target.id;

  if p_status = 'suspended' then
    -- Cancel upcoming live appointments on either side.
    for appt in
      select a.id, a.doctor_id
      from public.appointments a
      where (a.doctor_id = target.id or a.patient_id = target.id)
        and a.status in ('pending_payment', 'confirmed')
        and a.slot_start > now()
      for update
    loop
      update public.appointments
         set status = 'cancelled',
             cancelled_by = me,
             cancelled_at = now(),
             cancel_reason = case when appt.doctor_id = target.id then patient_msg else doctor_msg end
       where id = appt.id;

      insert into public.appointment_events (appointment_id, action, actor_id, note)
      values (appt.id, 'cancelled', me,
              case when appt.doctor_id = target.id then patient_msg else doctor_msg end);
      cancelled := cancelled + 1;
    end loop;

    delete from public.slot_holds where patient_id = target.id or doctor_id = target.id;
  end if;

  insert into public.admin_actions (admin_id, target_user_id, action, reason, details)
  values (
    me, target.id,
    case p_status when 'suspended' then 'suspended' else 'reactivated' end,
    reason,
    jsonb_build_object('role', target.role, 'cancelled_appointments', cancelled)
  );

  return cancelled;
end;
$$;

revoke execute on function public.admin_set_user_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;
