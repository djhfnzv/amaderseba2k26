import type { Metadata } from "next";
import Link from "next/link";
import { DoctorAvatar } from "@/components/doctor/doctor-avatar";
import { VerificationBadge } from "@/components/doctor/verification-badge";
import { requireRole } from "@/lib/auth/guards";
import { doctorPhotoUrl } from "@/lib/doctor/constants";
import {
  getOrCreateOwnProfile,
  getPortfolioDetails,
  portfolioChecklist,
} from "@/lib/doctor/queries";

export const metadata: Metadata = { title: "Doctor dashboard · MedLife" };

export default async function DoctorDashboard() {
  const user = await requireRole("doctor", "/doctor");
  const profile = await getOrCreateOwnProfile(user);
  const details = await getPortfolioDetails(user.id);
  const checklist = portfolioChecklist({ profile, ...details });
  const done = checklist.filter((c) => c.done).length;
  const percent = Math.round((done / checklist.length) * 100);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <DoctorAvatar name={profile.display_name} photoUrl={doctorPhotoUrl(profile.photo_path)} size={64} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Welcome, {profile.display_name}
          </h1>
          <p className="text-slate-600">{profile.headline ?? "Manage your portfolio, schedule and patients."}</p>
        </div>
      </div>

      <VerificationBadge verified={profile.is_verified} slug={profile.slug} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Portfolio {percent}% complete</h2>
            <p className="text-sm text-slate-600">A complete portfolio builds patient trust.</p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/doctors/${profile.slug}`}
              target="_blank"
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              {profile.is_verified ? "View page ↗" : "Preview ↗"}
            </Link>
            <Link
              href="/doctor/portfolio"
              className="inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Edit portfolio
            </Link>
          </div>
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Portfolio completeness"
        >
          <div className="h-full rounded-full bg-teal-700" style={{ width: `${percent}%` }} />
        </div>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`grid size-5 place-items-center rounded-full text-xs font-bold ${
                  c.done ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                {c.done ? "✓" : ""}
              </span>
              <span className={c.done ? "text-slate-700" : "text-slate-900"}>
                {c.label}
                <span className="sr-only">{c.done ? " (done)" : " (to do)"}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-900">Coming soon</h2>
        <p className="mt-1 text-sm text-slate-600">
          Verification documents, weekly schedule, patient queue and prescriptions.
        </p>
      </section>
    </div>
  );
}
