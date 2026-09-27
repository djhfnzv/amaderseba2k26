# MedLife

Doctor e-portfolio & telemedicine platform — verified doctor portfolios, in-person/online
booking, video consultation and signed digital prescriptions.

**Stack:** Next.js 16 (App Router, Server Actions) · Supabase (Postgres + RLS, Auth) · Tailwind CSS 4 · TypeScript · Zod

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + keys
npm run dev                  # http://localhost:3000
```

### Database

SQL migrations live in [`supabase/migrations/`](supabase/migrations/), one per module. Apply them
in order: open **Supabase Dashboard → SQL Editor**, paste the file, and run it
(or use the Supabase CLI: `supabase link` then `supabase db push`).

### Creating an admin

Sign up normally, then run [`supabase/seed/promote_admin.sql`](supabase/seed/promote_admin.sql)
with your email in the SQL editor. Log out and back in.

## Progress

| Branch | Scope | Status |
|---|---|---|
| `feature/landing-page` | Project scaffold + public landing page | ✅ merged |
| `feature/m1-auth` | M1 Authentication & Role Management | ✅ merged |
| `feature/m2-patient-profile` | M2 Patient Profile & Medical Records | ✅ merged |
| `feature/m3-doctor-portfolio` | M3 Doctor Portfolio | ✅ |

## M1 — Authentication & roles

- **Sign up** (`/signup`): name, email, password, and *patient* or *doctor*. Email verification
  is skipped for now: the server creates an already-confirmed account and logs the user in.
- **Log in** (`/login`), **forgot / reset password** (`/forgot-password` → email link →
  `/reset-password`), **log out**.
- **Roles:** `patient`, `doctor`, `admin`. Sign-up can never create an admin.
- **Route guards:** `/patient/*`, `/doctor/*`, `/admin/*` are only reachable by that role.
  `src/proxy.ts` does fast checks from the session; each area's layout re-checks the database
  (`requireRole()` in `src/lib/auth/guards.ts`); Row Level Security protects the data.
- Users can't change their own role or status. Suspended users are sent to `/suspended`.

## M2 — Patient profile & medical records

- **Health profile** (`/patient/profile`): date of birth (age is calculated), sex, weight,
  height, blood group, allergies, chronic conditions, emergency contact.
- **Medical records** (`/patient/records`): upload PDF/JPG/PNG up to 10 MB, with title, type,
  report date and notes. Open, download, delete.
- **After sign-up**, patients get an optional 2-step setup (profile → reports), then the dashboard.
- **Storage:** private bucket `medical-files`, one folder per patient. The server issues a
  one-time upload URL, the browser uploads directly, and the server checks the stored file's real
  type and size before saving it. Files are opened through links that expire after 60 seconds.
- **Access:** patients see only their own data (RLS on tables and storage). Doctor access for
  booked patients comes with M7; access logging with M14.

## M3 — Doctor portfolio

- **Editor** (`/doctor/portfolio`): photo, name, headline, bio, license number, practicing-since
  year, specialties (up to 5), languages, online / in-person fees (৳), and repeatable sections
  for education, experience, chambers, publications and awards.
- **Public page** (`/doctors/[slug]`): server-rendered with meta tags, Open Graph and
  schema.org `Physician` JSON-LD. The address is generated from the name and editable.
- **Visibility:** only **verified** doctors with active accounts are public. A doctor can always
  preview their own page (never indexed). Doctors cannot verify themselves (DB trigger).
- **Until M4:** verify a doctor for testing with
  [`supabase/seed/verify_doctor.sql`](supabase/seed/verify_doctor.sql).
- **Photos:** public bucket `doctor-photos` (2 MB, JPG/PNG/WebP), same signed-upload +
  server-check flow as M2.

## Project layout

```
src/
  app/
    (auth)/              login, signup, forgot-password, reset-password, actions.ts
    auth/confirm/        handles links from Supabase emails
    patient/ doctor/ admin/   role areas (guarded)
    page.tsx             landing page
  components/
    landing/             landing page sections
    auth/ layout/ ui/    shared components
  lib/
    auth/                roles + guards
    supabase/            browser / server / admin / proxy clients
    validation/          zod schemas
    site.ts              site name, nav links, auth URLs
  proxy.ts               session refresh + route guards
  types/database.ts      DB types
supabase/
  migrations/            SQL per module
  seed/                  helper scripts
```
