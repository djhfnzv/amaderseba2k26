import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrescriptionStatusPill, PrescriptionView } from "@/components/prescriptions/prescription-view";
import { audit } from "@/lib/audit/log";
import { requireRole } from "@/lib/auth/guards";
import { getPrescription } from "@/lib/prescriptions/queries";

export const metadata: Metadata = { title: "Prescription · Admin · MedLife" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminPrescriptionPage({ params }: PageProps<"/admin/prescriptions/[id]">) {
  await requireRole("admin", "/admin/prescriptions");
  const { id } = await params;
  const rx = UUID.test(id) ? await getPrescription(id) : null;
  if (!rx || rx.status === "draft") notFound();
  await audit({
    category: "prescription",
    action: "prescription.view",
    targetType: "prescription",
    targetId: rx.id,
    patientId: rx.patient_id,
    metadata: { via: "admin", status: rx.status },
  });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/prescriptions" className="text-sm font-medium text-teal-700 hover:underline">← Prescriptions</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Prescription {rx.verify_code}</h1>
          <PrescriptionStatusPill status={rx.status} />
        </div>
        <a
          href={`/prescriptions/${rx.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Open PDF
        </a>
      </div>
      <PrescriptionView rx={rx} zone="Asia/Dhaka" />
    </div>
  );
}
