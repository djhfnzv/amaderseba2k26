-- =============================================================================
-- Fix: logged-out visitors could not read public portfolio details.
--
-- The M3 read policy on doctor_specialties / doctor_education / doctor_experience
-- / doctor_chambers / doctor_publications / doctor_awards is
--   doctor_is_public(doctor_id) or doctor_id = auth.uid() or public.is_admin()
-- and applies to anon. M1 revoked EXECUTE on is_admin() from anon, so Postgres
-- rejected every anon query on those tables ("permission denied for function
-- is_admin"). That broke search_doctors() (M5) and hid education, experience,
-- chambers etc. on public doctor pages for logged-out visitors.
--
-- is_admin() is safe to expose: for anon, auth.uid() is null so it returns false.
-- =============================================================================

grant execute on function public.is_admin() to anon;
