import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrescriptionEditor } from "@/components/prescriptions/prescription-editor";
import { PrescriptionStatusPill, PrescriptionView } from "@/components/prescriptions/prescription-view";
import { Alert } from "@/components/ui/alert";
import { LocalTime } from "@/components/ui/local-time";
import { audit } from "@/lib/audit/log";
import { requireRole } from "@/lib/auth/guards";
import { getOrCreateOwnProfile } from "@/lib/doctor/queries";
import { formatDate, todayIso } from "@/lib/format";
import { amendPrescription } from "@/lib/prescriptions/actions";
import { getLastSigned, getPatientSnapshot, getPrescription, listQuickTests, listTemplates, listVersions } from "@/lib/prescriptions/queries";
import type { TemplatePayload } from "@/lib/prescriptions/schema";

export const metadata: Metadata = { title: "Prescription · MedLife" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DoctorPrescriptionPage({ params, searchParams }: PageProps<"/doctor/prescriptions/[id]">) {
  const user = await requireRole("doctor", "/doctor/prescriptions");
  const { id } = await params;
  const sp = await searchParams;
  const rx = UUID.test(id) ? await getPrescription(id) : null;
  if (!rx || rx.doctor_id !== user.id) notFound();
  await audit({
    category: "prescription",
    action: "prescription.view",
    targetType: "prescription",
    targetId: rx.id,
    patientId: rx.patient_id,
    metadata: { via: "doctor", status: rx.status },
  });
  const profile = await getOrCreateOwnProfile(user);

  const back = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium">
      <Link href="/doctor/prescriptions" className="text-teal-700 hover:underline">← Prescriptions</Link>
      {rx.appointment_id && (
        <Link href={`/doctor/appointments/${rx.appointment_id}`} className="text-teal-700 hover:underline">Appointment</Link>
      )}
    </div>
  );

  if (rx.status === "draft") {
    const [snapshot, templates, last, quickTests] = await Promise.all([
      rx.patient_id ? getPatientSnapshot(rx.patient_id) : Promise.resolve(null),
      listTemplates(user.id),
      rx.patient_id ? getLastSigned(user.id, rx.patient_id, rx.parent_id ?? undefined) : Promise.resolve(null),
      listQuickTests(),
    ]);
    const lastPayload: TemplatePayload | null = last
      ? {
          chief_complaint: last.chief_complaint,
          findings: last.findings,
          diagnosis: last.diagnosis,
          advice: last.advice,
          follow_up_note: last.follow_up_note,
          items: last.items.map((i) => ({
            medicine_id: i.medicine_id,
            medicine_name: i.medicine_name,
            generic_name: i.generic_name,
            strength: i.strength,
            form: i.form,
            dose: i.dose,
            timing: i.timing,
            duration: i.duration,
            instructions: i.instructions,
            is_controlled: i.is_controlled,
          })),
          tests: last.tests.map((t) => ({ name: t.name, note: t.note })),
        }
      : null;

    return (
      <div className="flex flex-col gap-6">
        {back}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {rx.parent_id ? `Amending prescription (v${rx.version})` : "Write prescription"}
          </h1>
          <PrescriptionStatusPill status={rx.status} />
          {rx.is_online && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Online visit — no controlled drugs</span>
          )}
        </div>
        <PrescriptionEditor
          rx={rx}
          allergies={snapshot?.allergies ?? []}
          conditions={snapshot?.chronic_conditions ?? []}
          templates={templates}
          last={last && lastPayload ? { payload: lastPayload, signedAt: formatDate(last.signed_at) } : null}
          canSign={profile.is_verified}
          todayIso={todayIso()}
          quickTests={quickTests.length ? quickTests : undefined}
        />
      </div>
    );
  }

  const versions = await listVersions(rx);
  const newer = versions.find((v) => v.version > rx.version && v.status !== "draft");
  const openAmendment = versions.find((v) => v.status === "draft");

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Prescription for {rx.patient_name}</h1>
        <PrescriptionStatusPill status={rx.status} />
      </div>

      {sp.signed === "1" && rx.status === "signed" && (
        <Alert kind="success">
          Signed and locked.{rx.patient_id ? " The patient can now see it in their account." : " Download the PDF to hand it over."}
        </Alert>
      )}
      {sp.error === "amend" && <Alert>Couldn&apos;t start an amendment. Please try again.</Alert>}
      {rx.status === "superseded" && newer && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This version was replaced.{" "}
          <Link href={`/doctor/prescriptions/${newer.id}`} className="font-semibold underline">Open version {newer.version}</Link>
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_17rem]">
        <PrescriptionView rx={rx} zone={profile.timezone} />

        <aside className="flex flex-col gap-4 @4xl:self-start">
          <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5">
            <a
              href={`/prescriptions/${rx.id}/pdf?download=1`}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Download PDF
            </a>
            <a
              href={`/prescriptions/${rx.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Open / print
            </a>
            {rx.verify_code && (
              <Link
                href={`/verify/${rx.verify_code}`}
                target="_blank"
                className="text-center text-sm font-medium text-teal-700 hover:underline"
              >
                Public verification page
              </Link>
            )}
          </section>

          {rx.status === "signed" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900">Need a change?</h2>
              <p className="mt-1 text-sm text-slate-600">
                Signed prescriptions can&apos;t be edited. Amending makes a new version; once you sign it, this one is marked replaced.
              </p>
              {openAmendment ? (
                <Link
                  href={`/doctor/prescriptions/${openAmendment.id}`}
                  className="mt-3 inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Continue amendment (draft)
                </Link>
              ) : (
                <form action={amendPrescription} className="mt-3">
                  <input type="hidden" name="id" value={rx.id} />
                  <button type="submit" className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                    Amend
                  </button>
                </form>
              )}
            </section>
          )}

          {versions.length > 1 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900">Versions</h2>
              <ol className="mt-2 flex flex-col gap-1 text-sm">
                {versions.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/doctor/prescriptions/${v.id}`}
                      aria-current={v.id === rx.id ? "page" : undefined}
                      className={`flex justify-between gap-2 rounded-md px-2 py-1 ${v.id === rx.id ? "bg-teal-50 font-semibold text-teal-900" : "text-slate-700 hover:bg-slate-50"}`}
                    >
                      <span>v{v.version} · {v.status === "superseded" ? "replaced" : v.status}</span>
                      {v.signed_at && <LocalTime iso={v.signed_at} format="dayMonth" fallbackZone={profile.timezone} className="text-slate-500" />}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
