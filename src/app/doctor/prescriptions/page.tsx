import type { Metadata } from "next";
import Link from "next/link";
import { PrescriptionStatusPill } from "@/components/prescriptions/prescription-view";
import { LocalTime } from "@/components/ui/local-time";
import { requireRole } from "@/lib/auth/guards";
import { getOrCreateOwnProfile } from "@/lib/doctor/queries";
import { listDoctorPrescriptions } from "@/lib/prescriptions/queries";
import type { PrescriptionStatus } from "@/types/database";

export const metadata: Metadata = { title: "Prescriptions · MedLife" };

const TABS: { value: PrescriptionStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "signed", label: "Signed" },
];

export default async function DoctorPrescriptionsPage({ searchParams }: PageProps<"/doctor/prescriptions">) {
  const user = await requireRole("doctor", "/doctor/prescriptions");
  const profile = await getOrCreateOwnProfile(user);
  const sp = await searchParams;
  const tab = TABS.find((t) => t.value === sp.status)?.value ?? "all";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const rows = await listDoctorPrescriptions(user.id, { status: tab === "all" ? undefined : tab, q });

  const href = (status: string) => `/doctor/prescriptions?${new URLSearchParams({ status, ...(q ? { q } : {}) })}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Prescriptions</h1>
          <p className="mt-1 text-slate-600">Write, sign and share prescriptions. Signed ones carry a QR code anyone can verify.</p>
        </div>
        <Link
          href="/doctor/prescriptions/new"
          className="inline-flex h-11 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
        >
          + New prescription
        </Link>
      </div>

      {!profile.is_verified && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You can write drafts now. Signing unlocks once your account is{" "}
          <Link href="/doctor/verification" className="font-semibold underline">verified</Link>.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter prescriptions" className="flex gap-1 rounded-lg bg-slate-100 p-1 sm:self-start">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={href(t.value)}
              aria-current={t.value === tab ? "page" : undefined}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                t.value === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form className="flex gap-2" role="search">
          <input type="hidden" name="status" value={tab} />
          <label htmlFor="rx-q" className="sr-only">Search by patient name</label>
          <input
            id="rx-q"
            name="q"
            defaultValue={q}
            placeholder="Search patient…"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600 sm:w-56"
          />
          <button type="submit" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50">
            Search
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          {q ? "No prescriptions match that name." : "No prescriptions yet. Start one from an appointment or with “New prescription”."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/doctor/prescriptions/${r.id}`} className="flex flex-col gap-1 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {r.patient_name || "Unnamed patient"}
                    {!r.patient_id && <span className="ml-2 text-xs font-normal text-slate-500">(entered manually)</span>}
                  </p>
                  <p className="truncate text-sm text-slate-600">
                    {r.diagnosis || "No diagnosis yet"}
                    {r.version > 1 && ` · v${r.version}`}
                  </p>
                </div>
                <span className="w-44 shrink-0 text-sm text-slate-600">
                  <LocalTime iso={r.signed_at ?? r.updated_at} fallbackZone={profile.timezone} />
                </span>
                <PrescriptionStatusPill status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
