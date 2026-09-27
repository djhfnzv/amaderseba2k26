-- TEMPORARY (until M4 admin verification is built):
-- Mark a doctor as verified so their public portfolio goes live.
-- Find the slug on the doctor's Portfolio page (e.g. dr-nadia-rahman).

update public.doctor_profiles
   set is_verified = true
 where slug = 'dr-your-slug';

-- To hide it again:
-- update public.doctor_profiles set is_verified = false where slug = 'dr-your-slug';
