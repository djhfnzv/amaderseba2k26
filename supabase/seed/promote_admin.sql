-- Promote an existing account to admin.
-- 1. Sign up normally through the app.
-- 2. Replace the email below and run this in the Supabase SQL editor.
-- 3. Log out and log back in so the new role is in your session.

update public.users
   set role = 'admin'
 where email = 'admin@teckpal.com';
