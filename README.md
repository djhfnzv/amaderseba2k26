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
| `feature/m3-doctor-portfolio` | M3 Doctor Portfolio | ✅ merged |
| `feature/m4-doctor-verification` | M4 Doctor Verification | ✅ merged |
| `feature/m5-search` | M5 Search & Discovery | ✅ merged |
| `feature/m6-schedule` | M6 Schedule Engine | ✅ merged |
| `feature/m7-booking` | M7 Appointments & Booking | ✅ |

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
- **Photos:** public bucket `doctor-photos` (2 MB, JPG/PNG/WebP), same signed-upload +
  server-check flow as M2.

## M4 — Doctor verification

- **Doctor** (`/doctor/verification`): uploads medical license, degree certificate and national ID
  (private `verification-docs` bucket), sees a checklist, then submits. Documents are locked while
  under review. If rejected, the doctor sees the reason, fixes documents and resubmits.
- **Admin** (`/admin/verifications`): queue with Pending / Approved / Rejected / All tabs. Each
  request shows the doctor's details, claimed education, documents (60-second links) and full
  history. **Approve** makes the page public; **Reject** and **Revoke** require a reason the
  doctor sees.
- Status changes go only through database functions (`submit_verification_request`,
  `review_verification_request`), which check permissions, required documents and the current
  status, keep `doctor_profiles.is_verified` in sync and write `verification_events`.

## M5 — Search & discovery

- **`/doctors`**: search by name, headline or specialty; filter by specialty, consultation type,
  fee range (৳), language and chamber city; sort by best match, fee or experience; 12 per page.
  Filters are a plain GET form, so every search is a shareable URL and works without JavaScript.
- **Landing page**: hero search box; specialty cards open `/doctors?specialty=…`.
- **Only public doctors** (verified + active) are ever listed: search runs as an anonymous visitor
  through the `search_doctors()` DB function, with trigram indexes for fast name matching.
- **SEO**: `/sitemap.xml` (all public doctors + specialty pages, hourly), `/robots.txt`
  (private areas excluded), per-specialty titles; filter combinations are `noindex`.
- Coming later: "next available slot" (M6/M7) and rating (M12) filters.

## M6 — Schedule engine

- **Slot rules:** a new slot starts every **30 minutes** from the block start (9:00, 9:30, …).
  Consultation length is **15–25 min per block (default 20)**; the rest of each 30 minutes is
  buffer. Patients can book from **2 hours** ahead up to **30 days** ahead.
- **Doctor** (`/doctor/schedule`): time zone (default Asia/Dhaka); weekly hours as time blocks per
  day (apply to several days at once; multiple blocks = breaks), each online or in-person at a
  chamber; pause/resume/delete blocks; leave and blocked dates (whole days or part of a day,
  private note); 7-day preview.
- **Public profile:** "Available slots" for the next 7 days with day and online/in-person tabs,
  shown in the **viewer's** time zone. Booking itself arrives in M7.
- Hours and leave are stored in the doctor's local time; `get_available_slots()` returns UTC.
  The DB refuses overlapping blocks and blocks at another doctor's chamber.

## M7 — Appointments & booking

- **Booking (≤ 4 steps):** pick type → pick slot on the doctor's page → (log in) → confirm.
  The slot is **held for 5 minutes** while the patient confirms (`/patient/book/[holdId]`), then the
  appointment is **confirmed automatically**. Until payments (M8), in-person visits are paid at the
  chamber and online visits show "payment due".
- **Rules:** one upcoming appointment per patient per doctor; patients can cancel or reschedule
  up to **2 hours** before; doctors can cancel any time with a reason the patient sees.
- **No double booking (NFR-04):** unique index on (doctor, start time) for live appointments, a
  per-doctor lock in every booking function, and booked/held slots removed from availability.
- **Patient:** `/patient/appointments` (upcoming, past), detail page with reschedule, cancel and
  history; upcoming visits on the dashboard.
- **Doctor:** `/doctor/appointments` (Today queue with serial numbers / Upcoming / Past); detail page
  with the patient's **health profile and reports** (FR-D-07: only for patients who booked them),
  start / complete / no-show, reschedule, cancel; today's count on the dashboard.
- **Search:** "Next available" on doctor cards, an **Available** filter (today / 3 days / week) and a
  **Available soonest** sort.
- All changes go through DB functions (`hold_slot`, `confirm_booking`, `cancel_appointment`,
  `reschedule_appointment`, `update_appointment_status`) and are logged in `appointment_events`.

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
