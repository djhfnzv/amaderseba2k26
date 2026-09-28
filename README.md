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
| `feature/m7-booking` | M7 Appointments & Booking | ✅ merged |
| `feature/m13-admin-users` | M13 (basic) Admin user management | ✅ merged |
| `feature/m8-payments` | M8 Payments (SSLCommerz) | ✅ merged |
| `feature/m9-video-consultation` | M9 Video consultation (free WebRTC) | ✅ merged |
| `feature/m10-prescriptions` | M10 E-prescription + advice notes | ✅ merged |
| `feature/m11-notifications` | M11 Notifications (in-app + SMS) | ✅ |

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

## M13 (basic) — Admin user management

- **`/admin/users`**: search by name, email or phone; filter by role (tabs) and status; 25 per page.
- **`/admin/users/[id]`**: account details, doctor verification status, appointment counts, admin
  history, and **Suspend** (reason required, shown to the user) / **Reactivate** (FR-A-02).
- **Suspending** (DB function `admin_set_user_status`): cancels the user's upcoming appointments
  (patients of a suspended doctor get a neutral message, not the admin's reason), drops slot holds,
  removes a doctor from search/public pages, and bans the account at the Auth layer so it can't
  sign in or refresh its session. Every action is logged in `admin_actions`.
- Admins can't suspend themselves or other admins.
- **Admin dashboard**: pending verifications, appointments today/upcoming, patients, doctors
  (verified), suspended accounts.

## M8 — Payments (SSLCommerz)

- **Checkout:** after the 5-minute hold, the patient confirms. Online consultations are paid online;
  in-person visits can be paid online or at the chamber. Paying online creates a
  **pending payment** appointment that keeps the slot for 15 minutes (admin-configurable) and
  sends the patient to SSLCommerz (card, bKash, Nagad, internet banking).
- **Confirmation:** SSLCommerz posts back to `/api/payments/sslcommerz/{success|fail|cancel|ipn}`.
  The server **re-validates every transaction with SSLCommerz** (never trusts the redirect), checks
  the amount, then confirms the appointment. Handling is idempotent (redirect + IPN). Unpaid
  bookings expire after the window and the slot is released; patients can retry until then.
- **Refunds:** on cancellation of a paid appointment — full if the doctor/admin cancels or the
  patient cancels ≥ 24h before, 50% if later (both admin-configurable). Issued through the
  SSLCommerz refund API; failures are listed for admins to retry.
- **Commission & payouts:** 10% platform commission (configurable) recorded per payment. Doctors see
  earnings and payouts at `/doctor/earnings`; admins record payouts at `/admin/payouts`.
- **Admin:** `/admin/payments` (payments, revenue, failed refunds), `/admin/payouts`,
  `/admin/settings` (commission, refund policy, payment window).
- **Receipt:** printable at `/patient/appointments/[id]/receipt` (FR-P-05).
- **Config (.env.local):** `PAYMENT_PROVIDER=sslcommerz`, `SSLCOMMERZ_STORE_ID`,
  `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_SANDBOX=true|false`. The public sandbox test store is
  `testbox` / `qwerty`. `PAYMENT_PROVIDER=mock` gives an offline test gateway (`/pay/mock`),
  refused in production. The IPN URL must be publicly reachable, so IPN only works once deployed;
  locally the browser redirect completes the payment.

## M9 — Video consultation (free, peer-to-peer WebRTC)

- **Room** `/consult/[appointmentId]` for online appointments — only that doctor and patient. Opens
  10 min before the start; closes when the doctor ends it or 30 min after the scheduled end.
  Before that it shows a countdown and opens automatically.
- **Lobby:** camera/mic preview, device pickers, mute and camera-off; falls back to audio-only if
  there's no camera.
- **Call:** video/audio go **directly between the two browsers** (WebRTC, always encrypted).
  Signaling uses a private Supabase Realtime channel `consult:<appointmentId>` protected by RLS on
  `realtime.messages`. The doctor always makes the offer (no collisions); dropped connections
  restart ICE automatically. Not recorded.
- **Chat & files** (FR-P-09, FR-D-08): saved to `consultation_messages`; files go to the private
  `consultation-files` bucket and open via 60-second links. Read-only after the call.
- **Doctor side panel:** patient health profile, allergies, reports, and autosaved private
  **consultation notes**.
- **Status:** doctor joining → *In progress*; **End consultation** → *Completed* for both.
- **Join buttons** on the patient and doctor appointment pages, active only in the room window.
- **Network:** STUN (free, Google) is built in. For reliable calls on mobile networks add a TURN
  server in `.env.local` — either `TURN_URLS`/`TURN_USERNAME`/`TURN_CREDENTIAL` or
  `METERED_TURN_DOMAIN`/`METERED_TURN_API_KEY` (metered.ca free tier). Cameras need `localhost`
  or HTTPS.

## M10 — E-prescription & advice notes

- **Write** (`/doctor/prescriptions`, or **Write prescription** on an appointment): for one of the
  doctor's own patients (details, allergies and conditions come from their profile) or for a patient
  **entered manually** (walk-in, no account). From an appointment it is linked to that visit and the
  consultation notes pre-fill complaint, findings, diagnosis and advice (FR-D-09).
- **Editor:** complaints, examination, diagnosis; medicines with type-ahead over the catalogue,
  dose presets (1+0+1 …), timing (before/after meal …), duration and instructions; add a medicine
  that isn't listed (saved to the doctor's own list, FR-D-10); investigations (common tests +
  custom); advice with quick suggestions; follow-up date. **Templates** and **copy last
  prescription** (FR-D-11). Drafts can be saved, previewed as PDF and deleted.
- **Safety:** allergy warnings (name + drug-group match, e.g. penicillin → amoxicillin) that the doctor
  must tick to override (FR-D-12); **controlled drugs are blocked in online consultations** (NFR-10),
  enforced in the database.
- **Sign & lock** (verified doctors only, FR-D-13): the doctor's name, degrees, registration no.,
  specialty and chamber are frozen, a 10-character ID + QR code is issued, and the prescription can
  no longer be changed (DB triggers). **Amend** creates a new version; signing it marks the old one
  *Replaced* (FR-D-14).
- **PDF:** A4 at `/prescriptions/[id]/pdf` (doctor, patient, admin), with QR code; drafts show a
  DRAFT watermark.
- **Verify** (FR-G-05): `/verify/[code]` (public, from the QR) shows **Valid**, **Replaced — do not
  dispense** or **Not found**, with doctor, reg. no., patient initials and the medicine list.
  `/verify` lets pharmacies type the ID.
- **Advice notes:** doctors can send advice without a prescription from the appointment page.
- **Patient** (FR-P-10/11): `/patient/prescriptions` (current, replaced, advice) and a section on
  each appointment; view and download PDFs.
- **Admin:** `/admin/prescriptions` (read-only, search by doctor or ID) and `/admin/medicines`
  (FR-A-03): search, add, hide, mark controlled, **CSV import** (`generic_name, brand_name, strength,
  form, company, is_controlled`; duplicates skipped).
- **Catalogue:** seeded with ~390 common generics (name, strength, form — no brands) including 27
  controlled drugs. Add brands via CSV.
- **Retention:** signed prescriptions can't be deleted. A doctor with signed prescriptions can't be
  hard-deleted (suspend instead).

## M11 — Notifications (in-app + SMS)

- **In-app:** a bell with an unread count in every dashboard (live via Supabase Realtime), a dropdown
  of the latest items and a full page at `/patient|doctor|admin/notifications` (all / unread, mark
  all read). Clicking a notification marks it read and opens what it's about.
- **What notifies (DB triggers, so every path is covered):** booking confirmed / payment due /
  payment received, cancelled, rescheduled, online consultation started ("join now"), missed,
  expired, refund issued; prescription signed or updated; advice sent; verification approved /
  rejected / revoked (doctor); new verification request (admins).
- **Changes that affect someone else** (migration `20261007000002`): a patient adding or deleting a
  report notifies doctors they are about to see; doctor leave or changed hours that clash with a
  booking notify that patient (+ SMS) and the doctor (checked at commit, so replacing a day's hours
  doesn't cause false alarms); fee changes, chamber edits (+ SMS) or removal notify booked patients;
  saving or discarding a prescription draft tells the patient (at most once per 30 min per draft).
- **Your own actions** (saved, edited, deleted, booked, cancelled…) show a pop-up with the chime —
  not stored in the list. Server actions call `flash()` (`src/lib/flash.ts`).
- **Sound & pop-ups:** new notifications play a short chime (can be muted from the bell) and pop up
  in the corner; the notifications page refreshes itself. Polling every 45 s backs up Realtime.
- **Reminders (FR-P-07):** 24 hours and 1 hour before each confirmed appointment (skipped when it
  was booked too recently for them to make sense).
- **SMS (BulkSMSBD):** patients and doctors add a Bangladeshi mobile number on their notifications
  page and confirm it with a 6-digit code (60-second resend, 5 codes a day, 5 tries). They can turn
  SMS off or remove the number. Texts are plain English and never include diagnoses or medicines.
  Messages are queued in `sms_outbox`, sent right after the action and retried (2, 4, 8 min) if
  the gateway fails; stale ones (e.g. a reminder after the start time) are cancelled.
- **Admin** `/admin/sms`: queued / sent / failed / cancelled, gateway mode and balance, "Send queued
  now", retry failed.
- **Config (.env.local + Vercel):** `SMS_PROVIDER=bulksmsbd`, `BULKSMSBD_API_KEY`,
  `BULKSMSBD_SENDER_ID`, `CRON_SECRET`. Without them SMS runs in test mode (recorded, not sent; the
  verification code is shown on screen).
- **Scheduler:** the migration enables `pg_cron` + `pg_net` and runs `run_notification_jobs()` every
  minute (expire unpaid bookings, queue reminders, wake the SMS sender). Tell it where the site is
  by running this once in the SQL editor, with the deployed URL and your `CRON_SECRET`:

  ```sql
  select vault.create_secret('https://<your-site>/api/cron/notifications', 'medlife_dispatch_url');
  select vault.create_secret('<CRON_SECRET>', 'medlife_cron_secret');
  ```

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
