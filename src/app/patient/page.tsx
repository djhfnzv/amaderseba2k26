import type { Metadata } from "next";
import Link from "next/link";
import { AppointmentList } from "@/components/appointments/patient-appointment-list";
import { FileList } from "@/components/patient/file-list";
import { listPatientAppointments } from "@/lib/appointments/queries";
import { requireRole } from "@/lib/auth/guards";
import { ageFromDob } from "@/lib/format";
import { getHealthProfile, listMedicalFiles, profileCompleteness } from "@/lib/patient/queries";
import { SEX_OPTIONS } from "@/lib/patient/constants";
import type { PatientProfile } from "@/types/database";

export const metadata: Metadata = { title: "Dashboard · MedLife" };

export default async function PatientDashboard() {
  const user = await requireRole("patient", "/patient");
  const [profile, recentFiles, appointments] = await Promise.all([
    getHealthProfile(user.id),
    listMedicalFiles(3),
    listPatientAppointments(user.id, 50),
  ]);
  const { percent, missing } = profileCompleteness(profile);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Hello{user.full_name ? `, ${user.full_name}` : ""}
        </h1>
        <p className="mt-1 text-slate-600">
          Manage your health profile, appointments and prescriptions.
        </p>
      </div>

      {percent < 100 && <CompleteProfileCard percent={percent} missing={missing} />}

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] @5xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @5xl:gap-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Health summary</h2>
            <Link href="/patient/profile" className="text-sm font-medium text-teal-700 hover:underline">
              Edit
            </Link>
          </div>
          <HealthSummary profile={profile} />
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recent reports</h2>
            <Link href="/patient/records" className="text-sm font-medium text-teal-700 hover:underline">
              View all / upload
            </Link>
          </div>
          <FileList files={recentFiles} showDelete={false} />
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Upcoming appointments</h2>
          <Link href="/patient/appointments" className="text-sm font-medium text-teal-700 hover:underline">
            All appointments
          </Link>
        </div>
        {appointments.upcoming.length ? (
          <AppointmentList items={appointments.upcoming.slice(0, 3)} empty="" />
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">No upcoming appointments.</p>
            <Link href="/patient/doctors" className="inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
              Find a doctor
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function CompleteProfileCard({ percent, missing }: { percent: number; missing: string[] }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-teal-200 bg-teal-50 p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="flex-1">
        <h2 className="font-semibold text-teal-900">Complete your health profile</h2>
        <p className="mt-1 text-sm text-teal-900/80">
          Missing: {missing.join(", ")}. A complete profile helps doctors treat you safely.
        </p>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-white"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile completeness"
        >
          <div className="h-full rounded-full bg-teal-700" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <Link
        href="/patient/profile"
        className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
      >
        Complete profile
      </Link>
    </section>
  );
}

function HealthSummary({ profile }: { profile: PatientProfile | null }) {
  const age = ageFromDob(profile?.date_of_birth ?? null);
  const sex = SEX_OPTIONS.find((s) => s.value === profile?.sex)?.label;
  const rows: [string, string][] = [
    ["Age", age != null ? `${age} years` : "—"],
    ["Sex", sex ?? "—"],
    ["Blood group", profile?.blood_group ?? "—"],
    ["Weight", profile?.weight_kg != null ? `${profile.weight_kg} kg` : "—"],
    ["Height", profile?.height_cm != null ? `${profile.height_cm} cm` : "—"],
  ];

  return (
    <div className="mt-4 flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      <TagSummary label="Allergies" items={profile?.allergies ?? []} tone="red" />
      <TagSummary label="Chronic conditions" items={profile?.chronic_conditions ?? []} tone="slate" />
    </div>
  );
}

function TagSummary({ label, items, tone }: { label: string; items: string[]; tone: "red" | "slate" }) {
  const chip = tone === "red" ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-800";
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      {items.length ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map((i) => (
            <li key={i} className={`rounded-md px-2 py-0.5 text-sm ${chip}`}>
              {i}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm font-medium text-slate-900">None recorded</p>
      )}
    </div>
  );
}
