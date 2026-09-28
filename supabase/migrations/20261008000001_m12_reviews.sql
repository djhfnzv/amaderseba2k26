-- =============================================================================
-- M12. Reviews & ratings
-- Tables: reviews, review_reports, doctor_rating_stats, review_moderation_log
-- Functions: save_review, delete_review, reply_to_review, report_review,
--            moderate_review, doctor_public_reviews, my_doctor_reviews,
--            queue_review_requests; search_doctors gains rating filter/sort.
--
-- * FR-P-12: only the patient of a COMPLETED appointment can review it, once,
--   within 30 days of the visit; they can edit it for 7 days or delete it.
-- * Reviews are published immediately; words/phone numbers/links are
--   auto-flagged for admins (FR-A-06), who can hide/restore with a reason.
-- * FR-D-16: the doctor replies once (editable) and can report abuse.
-- * Public pages show "Rahim K." (or "Anonymous patient"); patient ids never
--   leave the database except to the patient themselves and admins.
-- * Average rating is shown from 3 reviews up.
-- Requires: M1-M11.
-- =============================================================================

create table if not exists public.reviews (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  doctor_id      uuid not null references public.doctor_profiles (user_id) on delete cascade,
  patient_id     uuid not null references public.users (id) on delete cascade,
  rating         smallint not null check (rating between 1 and 5),
  tags           text[] not null default '{}'
                 check (cardinality(tags) <= 6 and tags <@ array[
                   'Explains clearly', 'Good listener', 'On time', 'Friendly', 'Thorough', 'Helpful advice'
                 ]::text[]),
  body           text check (char_length(body) <= 1000),
  is_anonymous   boolean not null default false,
  author_label   text,                     -- "Rahim K." snapshot (null when anonymous)
  status         text not null default 'published' check (status in ('published', 'hidden')),
  hidden_reason  text check (char_length(hidden_reason) <= 300),
  hidden_at      timestamptz,
  flagged        boolean not null default false,
  flag_reason    text,
  reply_body     text check (char_length(reply_body) <= 1000),
  replied_at     timestamptz,
  edited_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists reviews_doctor_idx on public.reviews (doctor_id, created_at desc) where status = 'published';
create index if not exists reviews_patient_idx on public.reviews (patient_id);
create index if not exists reviews_queue_idx on public.reviews (created_at desc) where flagged or status = 'hidden';

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

create table if not exists public.review_reports (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.reviews (id) on delete cascade,
  reporter_id uuid not null references public.users (id) on delete cascade,
  reason      text not null check (char_length(trim(reason)) between 3 and 500),
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (review_id, reporter_id)
);

create table if not exists public.review_moderation_log (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.reviews (id) on delete cascade,
  actor_id   uuid references public.users (id) on delete set null,
  action     text not null check (action in ('hidden', 'restored', 'dismissed', 'reported', 'flagged')),
  reason     text check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.doctor_rating_stats (
  doctor_id    uuid primary key references public.doctor_profiles (user_id) on delete cascade,
  review_count integer not null default 0,
  rating_avg   numeric(3, 2),
  count_1      integer not null default 0,
  count_2      integer not null default 0,
  count_3      integer not null default 0,
  count_4      integer not null default 0,
  count_5      integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- RLS: patients see their own reviews, admins everything. Doctors and the
-- public go through the functions below (no patient ids).
-- -----------------------------------------------------------------------------
alter table public.reviews enable row level security;
alter table public.review_reports enable row level security;
alter table public.review_moderation_log enable row level security;
alter table public.doctor_rating_stats enable row level security;

create policy "patients read own reviews" on public.reviews for select to authenticated
  using (patient_id = auth.uid());
create policy "admins read reviews" on public.reviews for select to authenticated
  using (public.is_admin());
create policy "admins read review reports" on public.review_reports for select to authenticated
  using (public.is_admin());
create policy "admins read moderation log" on public.review_moderation_log for select to authenticated
  using (public.is_admin());
create policy "anyone reads public doctors' rating stats" on public.doctor_rating_stats for select to anon, authenticated
  using (public.doctor_is_public(doctor_id) or doctor_id = auth.uid() or public.is_admin());

revoke all on public.reviews, public.review_reports, public.review_moderation_log from anon;
revoke insert, update, delete on public.reviews, public.review_reports, public.review_moderation_log from authenticated;
grant select on public.reviews, public.review_reports, public.review_moderation_log to authenticated;
revoke insert, update, delete on public.doctor_rating_stats from anon, authenticated;
grant select on public.doctor_rating_stats to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Rating stats (published reviews only)
-- -----------------------------------------------------------------------------
create or replace function public.refresh_rating_stats(p_doctor uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.doctor_rating_stats as s
    (doctor_id, review_count, rating_avg, count_1, count_2, count_3, count_4, count_5, updated_at)
  select p_doctor,
         count(*),
         round(avg(r.rating)::numeric, 2),
         count(*) filter (where r.rating = 1),
         count(*) filter (where r.rating = 2),
         count(*) filter (where r.rating = 3),
         count(*) filter (where r.rating = 4),
         count(*) filter (where r.rating = 5),
         now()
    from public.reviews r
   where r.doctor_id = p_doctor and r.status = 'published'
  on conflict (doctor_id) do update
     set review_count = excluded.review_count, rating_avg = excluded.rating_avg,
         count_1 = excluded.count_1, count_2 = excluded.count_2, count_3 = excluded.count_3,
         count_4 = excluded.count_4, count_5 = excluded.count_5, updated_at = now();
$$;

revoke execute on function public.refresh_rating_stats(uuid) from public, anon, authenticated;

create or replace function public.reviews_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.doctor_profiles d where d.user_id = coalesce(new.doctor_id, old.doctor_id)) then
    perform public.refresh_rating_stats(coalesce(new.doctor_id, old.doctor_id));
  end if;
  return null;
end;
$$;

drop trigger if exists reviews_stats on public.reviews;
create trigger reviews_stats
  after insert or delete or update of rating, status on public.reviews
  for each row execute function public.reviews_after_change();

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- "Rahim Uddin Khan" -> "Rahim K."; "Rahim" -> "Rahim".
create or replace function public.review_author_label(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(trim(p_name), '') is null then null
    when array_length(regexp_split_to_array(trim(p_name), '\s+'), 1) = 1 then trim(p_name)
    else split_part(trim(p_name), ' ', 1) || ' '
         || upper(left((regexp_split_to_array(trim(p_name), '\s+'))[array_length(regexp_split_to_array(trim(p_name), '\s+'), 1)], 1)) || '.'
  end;
$$;

-- Why a review needs an admin's eyes (null = looks fine).
create or replace function public.review_flag_reason(p_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text := lower(coalesce(p_body, ''));
begin
  if t = '' then
    return null;
  end if;
  if t ~ '(https?://|www\.|\.com\b|\.net\b|\.org\b|\.bd\b)' then
    return 'Contains a link';
  end if;
  if t ~ '(\+?88)?0?1[3-9][0-9 -]{8,10}' or t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    return 'Contains contact details';
  end if;
  if t ~ '\m(fuck\w*|shit\w*|bitch\w*|bastard\w*|asshole\w*|idiot\w*|stupid|scam\w*|fraud\w*|chor|kutta|shala|haramjada|haramzada|bokachoda|magi|khankir?)\M' then
    return 'Possible abusive language';
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Patient: write / edit / delete
-- -----------------------------------------------------------------------------
create or replace function public.save_review(
  p_appointment uuid,
  p_rating      smallint,
  p_tags        text[] default '{}',
  p_body        text default null,
  p_anonymous   boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  a      public.appointments;
  r      public.reviews;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  flag   text;
  label  text;
  rid    uuid;
begin
  select * into a from public.appointments where id = p_appointment;
  if not found or a.patient_id is distinct from me then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;
  if a.status <> 'completed' then
    raise exception 'You can review a doctor once the appointment is completed' using errcode = '22023';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose a rating from 1 to 5 stars' using errcode = '22023';
  end if;

  flag := public.review_flag_reason(v_body);
  select case when p_anonymous then null else public.review_author_label(u.full_name) end
    into label from public.users u where u.id = me;

  select * into r from public.reviews where appointment_id = a.id;
  if not found then
    if a.slot_end < now() - interval '30 days' then
      raise exception 'Reviews can be written up to 30 days after the visit' using errcode = '22023';
    end if;
    insert into public.reviews (appointment_id, doctor_id, patient_id, rating, tags, body, is_anonymous, author_label, flagged, flag_reason)
    values (a.id, a.doctor_id, me, p_rating, coalesce(p_tags, '{}'), v_body, coalesce(p_anonymous, false), label, flag is not null, flag)
    returning id into rid;
  else
    if r.status = 'hidden' then
      raise exception 'This review was hidden by a moderator and can no longer be edited' using errcode = '22023';
    end if;
    if r.created_at < now() - interval '7 days' then
      raise exception 'Reviews can be edited for 7 days after posting' using errcode = '22023';
    end if;
    update public.reviews
       set rating = p_rating, tags = coalesce(p_tags, '{}'), body = v_body,
           is_anonymous = coalesce(p_anonymous, false), author_label = label,
           flagged = r.flagged or flag is not null, flag_reason = coalesce(flag, r.flag_reason),
           edited_at = now()
     where id = r.id
    returning id into rid;
  end if;

  if flag is not null then
    insert into public.review_moderation_log (review_id, actor_id, action, reason) values (rid, null, 'flagged', flag);
  end if;
  return rid;
end;
$$;

create or replace function public.delete_review(p_review uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.reviews where id = p_review and patient_id = auth.uid();
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Doctor: list (no patient ids), reply, report
-- -----------------------------------------------------------------------------
create or replace function public.my_doctor_reviews(p_filter text default 'all', p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, rating smallint, tags text[], body text, author text, status text, hidden_reason text,
  reply_body text, replied_at timestamptz, created_at timestamptz, edited_at timestamptz,
  visit_date timestamptz, consultation_type text, reported boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.tags, r.body,
         case when r.is_anonymous then null else r.author_label end,
         r.status, r.hidden_reason, r.reply_body, r.replied_at, r.created_at, r.edited_at,
         a.slot_start, a.consultation_type,
         exists (select 1 from public.review_reports x where x.review_id = r.id and x.reporter_id = auth.uid())
    from public.reviews r
    join public.appointments a on a.id = r.appointment_id
   where r.doctor_id = auth.uid()
     and (p_filter <> 'unreplied' or (r.reply_body is null and r.status = 'published'))
   order by r.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.reply_to_review(p_review uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := nullif(trim(coalesce(p_body, '')), '');
begin
  if v_body is not null and char_length(v_body) > 1000 then
    raise exception 'Keep your reply under 1000 characters' using errcode = '22023';
  end if;
  update public.reviews
     set reply_body = v_body,
         replied_at = case when v_body is null then null else coalesce(replied_at, now()) end
   where id = p_review and doctor_id = auth.uid() and status = 'published';
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.report_review(p_review uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.reviews r where r.id = p_review and r.doctor_id = me) then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Tell us briefly what is wrong with this review' using errcode = '22023';
  end if;
  insert into public.review_reports (review_id, reporter_id, reason)
  values (p_review, me, left(trim(p_reason), 500))
  on conflict (review_id, reporter_id) do update set reason = excluded.reason, resolved_at = null, created_at = now();
  update public.reviews set flagged = true, flag_reason = coalesce(flag_reason, 'Reported by the doctor') where id = p_review;
  insert into public.review_moderation_log (review_id, actor_id, action, reason) values (p_review, me, 'reported', left(trim(p_reason), 500));
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin moderation (FR-A-06)
-- -----------------------------------------------------------------------------
create or replace function public.moderate_review(p_review uuid, p_action text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_action = 'hide' then
    if v_reason is null then
      raise exception 'Give a reason — the patient will see it' using errcode = '22023';
    end if;
    update public.reviews
       set status = 'hidden', hidden_reason = left(v_reason, 300), hidden_at = now(), flagged = false
     where id = p_review;
  elsif p_action = 'restore' then
    update public.reviews
       set status = 'published', hidden_reason = null, hidden_at = null, flagged = false
     where id = p_review;
  elsif p_action = 'dismiss' then
    update public.reviews set flagged = false where id = p_review;
  else
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  update public.review_reports set resolved_at = now() where review_id = p_review and resolved_at is null;
  insert into public.review_moderation_log (review_id, actor_id, action, reason)
  values (p_review, me, case p_action when 'hide' then 'hidden' when 'restore' then 'restored' else 'dismissed' end, v_reason);
end;
$$;

-- -----------------------------------------------------------------------------
-- Public list for a doctor's page
-- -----------------------------------------------------------------------------
create or replace function public.doctor_public_reviews(
  p_doctor uuid, p_sort text default 'newest', p_limit integer default 5, p_offset integer default 0
)
returns table (
  id uuid, rating smallint, tags text[], body text, author text, reply_body text, replied_at timestamptz,
  created_at timestamptz, edited_at timestamptz, consultation_type text, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.tags, r.body,
         case when r.is_anonymous then null else r.author_label end,
         r.reply_body, r.replied_at, r.created_at, r.edited_at, a.consultation_type,
         count(*) over ()
    from public.reviews r
    join public.appointments a on a.id = r.appointment_id
   where r.doctor_id = p_doctor
     and r.status = 'published'
     and (public.doctor_is_public(p_doctor) or p_doctor = auth.uid() or public.is_admin())
   order by
     case when p_sort = 'highest' then r.rating end desc nulls last,
     case when p_sort = 'lowest' then r.rating end asc nulls last,
     r.created_at desc
   limit least(greatest(coalesce(p_limit, 5), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.save_review(uuid, smallint, text[], text, boolean) from public, anon;
revoke execute on function public.delete_review(uuid) from public, anon;
revoke execute on function public.my_doctor_reviews(text, integer, integer) from public, anon;
revoke execute on function public.reply_to_review(uuid, text) from public, anon;
revoke execute on function public.report_review(uuid, text) from public, anon;
revoke execute on function public.moderate_review(uuid, text, text) from public, anon;
grant execute on function public.save_review(uuid, smallint, text[], text, boolean) to authenticated;
grant execute on function public.delete_review(uuid) to authenticated;
grant execute on function public.my_doctor_reviews(text, integer, integer) to authenticated;
grant execute on function public.reply_to_review(uuid, text) to authenticated;
grant execute on function public.report_review(uuid, text) to authenticated;
grant execute on function public.moderate_review(uuid, text, text) to authenticated;
grant execute on function public.doctor_public_reviews(uuid, text, integer, integer) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Notifications (M11)
-- -----------------------------------------------------------------------------
create or replace function public.notify_review_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc_name text;
  slug     text;
  adm      uuid;
  stars    text;
begin
  select d.display_name, d.slug into doc_name, slug from public.doctor_profiles d where d.user_id = new.doctor_id;
  stars := new.rating || '★';

  if tg_op = 'INSERT' then
    perform public.notify(new.doctor_id, 'review_new', format('New %s review', stars),
      coalesce(left(new.body, 140), 'A patient rated their visit.'), '/doctor/reviews', null, 'review:' || new.id);
    if new.flagged then
      for adm in select u.id from public.users u where u.role = 'admin' and u.status = 'active' loop
        perform public.notify(adm, 'review_flagged', 'Review needs a look',
          format('%s review for %s: %s', stars, coalesce(doc_name, 'a doctor'), coalesce(new.flag_reason, 'flagged')),
          '/admin/reviews', null, 'reviewflag:' || new.id || ':' || adm);
      end loop;
    end if;
    return null;
  end if;

  -- Doctor replied (first time, or changed the reply).
  if new.reply_body is not null and new.reply_body is distinct from old.reply_body then
    perform public.notify(new.patient_id, 'review_reply', format('%s replied to your review', coalesce(doc_name, 'Your doctor')),
      left(new.reply_body, 160), '/doctors/' || slug || '#reviews', null,
      'reviewreply:' || new.id || ':' || floor(extract(epoch from now()) / 3600)::bigint);
  end if;

  -- Hidden / restored by a moderator.
  if new.status is distinct from old.status then
    if new.status = 'hidden' then
      perform public.notify(new.patient_id, 'review_hidden', 'Your review was hidden',
        coalesce('Reason: ' || new.hidden_reason, 'It broke the review guidelines.'),
        '/patient/appointments/' || new.appointment_id, null, 'reviewhidden:' || new.id || ':' || txid_current());
    else
      perform public.notify(new.patient_id, 'review_restored', 'Your review is visible again', null,
        '/patient/appointments/' || new.appointment_id, null, 'reviewrestored:' || new.id || ':' || txid_current());
    end if;
  end if;

  -- Newly reported -> admins.
  if new.flagged and not old.flagged and new.status = 'published' then
    for adm in select u.id from public.users u where u.role = 'admin' and u.status = 'active' loop
      perform public.notify(adm, 'review_flagged', 'Review needs a look',
        format('%s review for %s: %s', stars, coalesce(doc_name, 'a doctor'), coalesce(new.flag_reason, 'flagged')),
        '/admin/reviews', null, 'reviewflag:' || new.id || ':' || adm || ':' || txid_current());
    end loop;
  end if;
  return null;
exception when others then
  raise warning 'notify_review_change failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists reviews_notify on public.reviews;
create trigger reviews_notify
  after insert or update on public.reviews
  for each row execute function public.notify_review_change();

-- "How was your visit?" about a day after a completed appointment.
create or replace function public.queue_review_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select a.id, a.patient_id, d.display_name
      from public.appointments a
      join public.doctor_profiles d on d.user_id = a.doctor_id
     where a.status = 'completed'
       and a.slot_end between now() - interval '3 days' and now() - interval '20 hours'
       and not exists (select 1 from public.reviews x where x.appointment_id = a.id)
  loop
    if public.notify(r.patient_id, 'review_request', format('How was your visit with %s?', coalesce(r.display_name, 'your doctor')),
         'Rate your visit to help other patients choose. It takes a minute.',
         '/patient/appointments/' || r.id || '#review', null, 'reviewask:' || r.id) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

revoke execute on function public.queue_review_requests() from public, anon, authenticated;
grant execute on function public.queue_review_requests() to service_role;

-- Add it to the every-minute job from M11.
create or replace function public.run_notification_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url    text;
  secret text;
begin
  perform public.expire_stale_payments(null);
  perform public.queue_appointment_reminders();
  perform public.queue_review_requests();

  if exists (select 1 from public.sms_outbox where status = 'pending' and not_before <= now()) then
    begin
      select s.decrypted_secret into url from vault.decrypted_secrets s where s.name = 'medlife_dispatch_url';
      select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'medlife_cron_secret';
      if url is not null and secret is not null then
        perform net.http_post(
          url := url,
          body := '{}'::jsonb,
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
          timeout_milliseconds := 15000
        );
      end if;
    exception when others then
      raise warning 'Could not wake the SMS sender: %', sqlerrm;
    end;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- search_doctors(): rating on cards, "4★ & up" filter and "Top rated" sort.
-- The average only counts once a doctor has 3+ reviews.
-- -----------------------------------------------------------------------------
drop function if exists public.search_doctors(text, text, text, numeric, numeric, text, text, text, integer, integer, integer);

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
  p_available_days integer default null,
  p_min_rating     numeric default null
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
  rating_avg          numeric,
  review_count        integer,
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
      ), '{}') as cities,
      coalesce(rs.review_count, 0) as review_count,
      case when coalesce(rs.review_count, 0) >= 3 then rs.rating_avg end as rating_avg
    from public.doctor_profiles dp
    left join public.doctor_rating_stats rs on rs.doctor_id = dp.user_id
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
      and (p_min_rating is null or (b.rating_avg is not null and b.rating_avg >= p_min_rating))
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
    w.specialties, w.degrees, w.cities, w.next_available, w.rating_avg, w.review_count,
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
    case when p_sort = 'rating' then w.rating_avg end desc nulls last,
    case when p_sort = 'rating' then w.review_count end desc,
    case when p_sort = 'soonest' then w.next_available end asc nulls last,
    case when p_sort = 'fee_asc' then w.fee end asc nulls last,
    case when p_sort = 'fee_desc' then w.fee end desc nulls last,
    case when p_sort = 'experience' then w.practice_since_year end asc nulls last,
    w.verified_at desc nulls last,
    w.display_name
  limit least(greatest(coalesce(p_limit, 12), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.search_doctors(text, text, text, numeric, numeric, text, text, text, integer, integer, integer, numeric)
  to anon, authenticated;
