-- =============================================================================
-- M5. Search & Discovery
-- Functions: search_doctors(), doctor_search_facets()
--
-- Only public doctors (verified + active) are ever returned. Both functions
-- are SECURITY INVOKER, so table RLS still applies on top of the explicit
-- doctor_is_public() filter.
-- "Next available slot" and rating filters arrive with M6/M7 and M12.
-- Requires: M3 (doctor_* tables, specialties, doctor_is_public).
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- Fast "contains" matching on names/headlines, and filter lookups.
create index if not exists doctor_profiles_name_trgm_idx
  on public.doctor_profiles using gin (display_name extensions.gin_trgm_ops);
create index if not exists doctor_profiles_headline_trgm_idx
  on public.doctor_profiles using gin (headline extensions.gin_trgm_ops);
create index if not exists doctor_profiles_verified_idx
  on public.doctor_profiles (verified_at desc) where is_verified;
create index if not exists doctor_profiles_languages_idx
  on public.doctor_profiles using gin (languages);
create index if not exists doctor_chambers_city_idx
  on public.doctor_chambers (lower(city));

-- -----------------------------------------------------------------------------
-- search_doctors()
--   p_query      free text: name, headline or specialty
--   p_specialty  specialty slug
--   p_type       'online' | 'in_person'
--   p_min_fee / p_max_fee  on the fee for p_type (or the lowest offered fee)
--   p_language, p_city     exact (case-insensitive)
--   p_sort       'relevance' | 'fee_asc' | 'fee_desc' | 'experience'
-- Returns one page plus total_count (the same on every row).
-- -----------------------------------------------------------------------------
create or replace function public.search_doctors(
  p_query     text    default null,
  p_specialty text    default null,
  p_type      text    default null,
  p_min_fee   numeric default null,
  p_max_fee   numeric default null,
  p_language  text    default null,
  p_city      text    default null,
  p_sort      text    default 'relevance',
  p_limit     integer default 12,
  p_offset    integer default 0
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
      -- Escape LIKE wildcards in user input.
      '%' || replace(replace(replace(coalesce(trim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  ),
  base as (
    select
      dp.user_id,
      dp.slug,
      dp.display_name,
      dp.headline,
      dp.photo_path,
      dp.practice_since_year,
      dp.languages,
      dp.offers_online,
      dp.offers_in_person,
      dp.fee_online,
      dp.fee_in_person,
      dp.verified_at,
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
        from public.doctor_specialties ds
        join public.specialties s on s.id = ds.specialty_id
        where ds.doctor_id = dp.user_id
      ), '{}') as specialties,
      coalesce((
        select array_agg(s.slug)
        from public.doctor_specialties ds
        join public.specialties s on s.id = ds.specialty_id
        where ds.doctor_id = dp.user_id
      ), '{}') as specialty_slugs,
      coalesce((
        select array_agg(e.degree order by e.year nulls last, e.created_at)
        from public.doctor_education e
        where e.doctor_id = dp.user_id
      ), '{}') as degrees,
      coalesce((
        select array_agg(distinct c.city order by c.city)
        from public.doctor_chambers c
        where c.doctor_id = dp.user_id
      ), '{}') as cities
    from public.doctor_profiles dp
    where dp.is_verified
      and public.doctor_is_public(dp.user_id)
  )
  select
    b.user_id,
    b.slug,
    b.display_name,
    b.headline,
    b.photo_path,
    b.practice_since_year,
    b.languages,
    b.offers_online,
    b.offers_in_person,
    b.fee_online,
    b.fee_in_person,
    b.specialties,
    b.degrees,
    b.cities,
    count(*) over () as total_count
  from base b
  cross join params p
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
    and (
      nullif(p_language, '') is null
      or exists (select 1 from unnest(b.languages) l where lower(l) = lower(p_language))
    )
    and (
      nullif(p_city, '') is null
      or exists (select 1 from unnest(b.cities) c where lower(c) = lower(p_city))
    )
  order by
    -- Relevance: names that start with the query first (ignoring a "Dr." prefix).
    case
      when p_sort = 'relevance' and p.q is not null
        and starts_with(regexp_replace(lower(b.display_name), '^dr\.?\s+', ''), lower(p.q)) then 0
      when p_sort = 'relevance' and p.q is not null and b.display_name ilike p.pattern then 1
      else 2
    end,
    case when p_sort = 'fee_asc' then b.fee end asc nulls last,
    case when p_sort = 'fee_desc' then b.fee end desc nulls last,
    case when p_sort = 'experience' then b.practice_since_year end asc nulls last,
    b.verified_at desc nulls last,
    b.display_name
  limit least(greatest(coalesce(p_limit, 12), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.search_doctors(text, text, text, numeric, numeric, text, text, text, integer, integer)
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- doctor_search_facets(): filter options that actually have public doctors
-- -----------------------------------------------------------------------------
create or replace function public.doctor_search_facets()
returns table (
  languages   text[],
  cities      text[],
  specialties jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with pub as (
    select dp.user_id, dp.languages
    from public.doctor_profiles dp
    where dp.is_verified and public.doctor_is_public(dp.user_id)
  )
  select
    coalesce((
      select array_agg(distinct initcap(l) order by initcap(l))
      from pub, unnest(pub.languages) l
    ), '{}'),
    coalesce((
      select array_agg(distinct initcap(c.city) order by initcap(c.city))
      from public.doctor_chambers c
      join pub on pub.user_id = c.doctor_id
    ), '{}'),
    coalesce((
      select jsonb_agg(jsonb_build_object('slug', s.slug, 'name', s.name, 'count', s.n) order by s.name)
      from (
        select sp.slug, sp.name, count(ds.doctor_id) as n
        from public.specialties sp
        left join public.doctor_specialties ds
          on ds.specialty_id = sp.id
         and ds.doctor_id in (select user_id from pub)
        where sp.is_active
        group by sp.id
      ) s
    ), '[]'::jsonb);
$$;

grant execute on function public.doctor_search_facets() to anon, authenticated;
