import type { Metadata } from "next";
import { AdviceList, PrescriptionList } from "@/components/prescriptions/rx-lists";
import { requireRole } from "@/lib/auth/guards";
import { listAdvice, listPatientPrescriptions } from "@/lib/prescriptions/queries";

export const metadata: Metadata = { title: "Prescriptions · MedLife" };

export default async function PatientPrescriptionsPage() {
  const user = await requireRole("patient", "/patient/prescriptions");
  const [prescriptions, advice] = await Promise.all([listPatientPrescriptions(user.id), listAdvice({ patientId: user.id })]);
  const current = prescriptions.filter((p) => p.status === "signed");
  const replaced = prescriptions.filter((p) => p.status === "superseded");
  const zone = "Asia/Dhaka";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Prescriptions</h1>
        <p className="mt-1 text-slate-600">Signed by your doctors. Each one has a QR code a pharmacy can scan to check it&apos;s genuine.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Current ({current.length})</h2>
          <PrescriptionList
            rows={current}
            hrefBase="/patient/prescriptions"
            zone={zone}
            showDoctor
            empty="No prescriptions yet. After a consultation, your doctor's prescription shows up here."
          />
          {replaced.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900">
                Replaced versions ({replaced.length})
              </summary>
              <div className="mt-3">
                <PrescriptionList rows={replaced} hrefBase="/patient/prescriptions" zone={zone} showDoctor empty="" />
              </div>
            </details>
          )}
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Advice from doctors ({advice.length})</h2>
          <AdviceList rows={advice} zone={zone} showDoctor empty="No advice notes yet." />
        </section>
      </div>
    </div>
  );
}
