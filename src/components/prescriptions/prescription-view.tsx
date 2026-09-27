import { LocalTime } from "@/components/ui/local-time";
import { formatDate } from "@/lib/format";
import { PRESCRIPTION_STATUS_LABEL, SEX_LABEL, TIMING_LABEL } from "@/lib/prescriptions/constants";
import type { PrescriptionDetail } from "@/lib/prescriptions/queries";
import type { PrescriptionStatus } from "@/types/database";

const PILL: Record<PrescriptionStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  signed: "bg-emerald-50 text-emerald-800",
  superseded: "bg-amber-50 text-amber-800",
};

export function PrescriptionStatusPill({ status }: { status: PrescriptionStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[status]}`}>
      {PRESCRIPTION_STATUS_LABEL[status]}
    </span>
  );
}

/** Read-only, paper-like prescription for screens (the PDF has the same layout). */
export function PrescriptionView({ rx, zone }: { rx: PrescriptionDetail; zone: string }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-col gap-3 border-b-2 border-teal-700 p-5 sm:flex-row sm:justify-between sm:p-6">
        <div>
          <p className="text-lg font-bold text-teal-800">{rx.doctor_name ?? "—"}</p>
          {rx.doctor_degrees && <p className="text-sm text-slate-600">{rx.doctor_degrees}</p>}
          {rx.doctor_specialty && <p className="text-sm text-slate-600">{rx.doctor_specialty}</p>}
          {rx.doctor_license && <p className="text-sm text-slate-600">Reg. No: {rx.doctor_license}</p>}
        </div>
        <div className="text-sm text-slate-600 sm:max-w-xs sm:text-right">
          {rx.doctor_chamber && <p>{rx.doctor_chamber}</p>}
          {rx.is_online && <p className="mt-1 font-medium text-teal-800">Online consultation</p>}
        </div>
      </header>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-200 px-5 py-3 text-sm sm:px-6">
        <Meta label="Patient"><span className="font-semibold">{rx.patient_name}</span></Meta>
        {rx.patient_age && <Meta label="Age">{rx.patient_age}</Meta>}
        {rx.patient_sex && <Meta label="Sex">{SEX_LABEL[rx.patient_sex]}</Meta>}
        {rx.patient_weight && <Meta label="Weight">{rx.patient_weight}</Meta>}
        {rx.signed_at && (
          <Meta label="Date"><LocalTime iso={rx.signed_at} format="date" fallbackZone={zone} /></Meta>
        )}
      </dl>

      <div className="grid gap-6 p-5 sm:p-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4 @3xl:border-r @3xl:border-slate-200 @3xl:pr-6">
          <Block title="Chief complaints" text={rx.chief_complaint} />
          <Block title="On examination" text={rx.findings} />
          <Block title="Diagnosis" text={rx.diagnosis} />
          {rx.tests.length > 0 && (
            <div>
              <BlockTitle>Investigations</BlockTitle>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-800">
                {rx.tests.map((t) => (
                  <li key={t.id}>
                    {t.name}
                    {t.note && <span className="text-slate-500"> ({t.note})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-2xl font-bold text-teal-700" aria-hidden="true">Rx</p>
          {rx.items.length === 0 ? (
            <p className="text-sm text-slate-500">No medicines prescribed.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {rx.items.map((it, i) => (
                <li key={it.id}>
                  <p className="font-semibold text-slate-900">
                    {i + 1}. {it.medicine_name}
                  </p>
                  <p className="pl-4 text-sm text-slate-700">
                    {[it.dose, it.timing ? TIMING_LABEL[it.timing] : null, it.duration].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {it.instructions && <p className="pl-4 text-sm text-slate-500">{it.instructions}</p>}
                </li>
              ))}
            </ol>
          )}
          <Block title="Advice" text={rx.advice} />
          {(rx.follow_up_date || rx.follow_up_note) && (
            <div>
              <BlockTitle>Follow-up</BlockTitle>
              <p className="mt-1 text-sm text-slate-800">
                {[rx.follow_up_date ? formatDate(rx.follow_up_date) : null, rx.follow_up_note].filter(Boolean).join(" — ")}
              </p>
            </div>
          )}
        </div>
      </div>

      {rx.verify_code && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600 sm:px-6">
          <span>
            Prescription ID <span className="font-mono font-semibold text-slate-900">{rx.verify_code}</span>
            {rx.version > 1 && ` · Version ${rx.version}`}
          </span>
          {rx.signed_at && (
            <span>
              Digitally signed · <LocalTime iso={rx.signed_at} fallbackZone={zone} />
            </span>
          )}
        </footer>
      )}
    </article>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1">
      <dt className="text-slate-500">{label}:</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  );
}

function BlockTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold tracking-wide text-teal-800 uppercase">{children}</h3>;
}

function Block({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <BlockTitle>{title}</BlockTitle>
      <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{text}</p>
    </div>
  );
}
