import type { Metadata } from "next";
import Link from "next/link";
import { PrescriptionStatusPill } from "@/components/prescriptions/prescription-view";
import { LocalTime } from "@/components/ui/local-time";
import { requireRole } from "@/lib/auth/guards";
import { listAllPrescriptions } from "@/lib/prescriptions/queries";

export const metadata: Metadata = { title: "Prescriptions · Admin · MedLife" };

export default async function AdminPrescriptionsPage({ searchParams }: PageProps<"/admin/prescriptions">) {
  await requireRole("admin", "/admin/prescriptions");
  const { q: raw } = await searchParams;
  const q = typeof raw === "string" ? raw.slice(0, 60) : "";
  const rows = await listAllPrescriptions({ q });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Prescriptions</h1>
        <p className="mt-1 text-slate-600">Read-only. Signed prescriptions can&apos;t be changed by anyone — only amended by their doctor.</p>
      </div>

      <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="q" className="sr-only">Search by doctor name or prescription ID</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Doctor name or prescription ID"
          className="h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-teal-600"
        />
        <button type="submit" className="h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">No signed prescriptions found.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/prescriptions/${r.id}`} className="flex flex-col gap-1 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                <span className="w-28 shrink-0 font-mono text-sm font-semibold text-slate-900">{r.verify_code}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{r.doctor_name ?? "Doctor"}</p>
                  <p className="truncate text-sm text-slate-600">
                    For {r.patient_name}
                    {!r.patient_id && " (entered manually)"}
                    {r.version > 1 && ` · v${r.version}`}
                  </p>
                </div>
                {r.signed_at && (
                  <span className="shrink-0 text-sm text-slate-600">
                    <LocalTime iso={r.signed_at} />
                  </span>
                )}
                <PrescriptionStatusPill status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
