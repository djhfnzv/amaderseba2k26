import Link from "next/link";
import { PrescriptionStatusPill } from "@/components/prescriptions/prescription-view";
import { LocalTime } from "@/components/ui/local-time";
import type { AdviceWithNames, PrescriptionListRow } from "@/lib/prescriptions/queries";

/** Compact list of prescriptions (appointment pages, patient area). */
export function PrescriptionList({
  rows,
  hrefBase,
  zone,
  showDoctor,
  empty,
}: {
  rows: PrescriptionListRow[];
  hrefBase: string;
  zone: string;
  showDoctor?: boolean;
  empty: string;
}) {
  if (!rows.length) return <p className="text-sm text-slate-600">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`${hrefBase}/${r.id}`} className="flex flex-col gap-1 p-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">
                {showDoctor ? (r.doctor_name ?? "Doctor") : r.patient_name}
                {r.version > 1 && <span className="font-normal text-slate-500"> · v{r.version}</span>}
              </p>
              <p className="truncate text-sm text-slate-600">{r.diagnosis || "Prescription"}</p>
            </div>
            <span className="shrink-0 text-sm text-slate-500">
              <LocalTime iso={r.signed_at ?? r.updated_at} format="date" fallbackZone={zone} />
            </span>
            <PrescriptionStatusPill status={r.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Advice notes, newest first. */
export function AdviceList({ rows, zone, showDoctor, empty }: { rows: AdviceWithNames[]; zone: string; showDoctor?: boolean; empty: string }) {
  if (!rows.length) return <p className="text-sm text-slate-600">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((a) => (
        <li key={a.id} className="animate-fade-in rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-slate-900">{a.title || "Advice"}</p>
            <span className="text-xs text-slate-500">
              {showDoctor && a.doctor_name ? `${a.doctor_name} · ` : ""}
              <LocalTime iso={a.created_at} fallbackZone={zone} />
            </span>
          </div>
          <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{a.body}</p>
        </li>
      ))}
    </ul>
  );
}
