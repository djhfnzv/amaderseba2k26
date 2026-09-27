import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrescriptionStatusPill, PrescriptionView } from "@/components/prescriptions/prescription-view";
import { requireRole } from "@/lib/auth/guards";
import { getPrescription, listVersions } from "@/lib/prescriptions/queries";

export const metadata: Metadata = { title: "Prescription · MedLife" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PatientPrescriptionPage({ params }: PageProps<"/patient/prescriptions/[id]">) {
  const user = await requireRole("patient", "/patient/prescriptions");
  const { id } = await params;
  const rx = UUID.test(id) ? await getPrescription(id) : null;
  if (!rx || rx.patient_id !== user.id || rx.status === "draft") notFound();
  const newer = rx.status === "superseded" ? (await listVersions(rx)).find((v) => v.version > rx.version && v.status !== "draft") : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium">
        <Link href="/patient/prescriptions" className="text-teal-700 hover:underline">← Prescriptions</Link>
        {rx.appointment_id && (
          <Link href={`/patient/appointments/${rx.appointment_id}`} className="text-teal-700 hover:underline">Appointment</Link>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Prescription</h1>
          <PrescriptionStatusPill status={rx.status} />
        </div>
        <div className="flex gap-2">
          <a
            href={`/prescriptions/${rx.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Open / print
          </a>
          <a
            href={`/prescriptions/${rx.id}/pdf?download=1`}
            className="inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Download PDF
          </a>
        </div>
      </div>

      {rx.status === "superseded" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Your doctor replaced this prescription with a newer version — don&apos;t use this one.{" "}
          {newer && (
            <Link href={`/patient/prescriptions/${newer.id}`} className="font-semibold underline">
              Open the current version
            </Link>
          )}
        </p>
      )}

      <PrescriptionView rx={rx} zone="Asia/Dhaka" />
    </div>
  );
}
