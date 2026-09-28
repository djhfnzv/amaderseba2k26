import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/landing/logo";
import { PrintButton } from "@/components/payments/print-button";
import { LocalTime } from "@/components/ui/local-time";
import { getAppointmentWithDoctor } from "@/lib/appointments/queries";
import { requireRole } from "@/lib/auth/guards";
import { formatFee } from "@/lib/doctor/constants";
import { getPaymentSummary } from "@/lib/payments/queries";
import { CONSULTATION_TYPE_LABEL } from "@/lib/schedule/constants";

export const metadata: Metadata = { title: "Payment receipt · MedLife", robots: { index: false } };

/** FR-P-05: printable payment receipt. */
export default async function ReceiptPage({ params }: PageProps<"/patient/appointments/[id]/receipt">) {
  const user = await requireRole("patient", "/patient/appointments");
  const { id } = await params;
  const appt = /^[0-9a-f-]{36}$/i.test(id) ? await getAppointmentWithDoctor(id) : null;
  if (!appt || appt.patient_id !== user.id) notFound();

  const { payment, refunds } = await getPaymentSummary(appt.id);
  if (!payment || payment.status !== "paid") notFound();
  const refunded = refunds.filter((r) => r.status === "succeeded").reduce((n, r) => n + Number(r.amount), 0);
  const zone = appt.doctor?.timezone;

  const rows: [string, React.ReactNode][] = [
    ["Receipt no.", payment.tran_id],
    ["Paid on", <LocalTime key="p" iso={payment.paid_at!} fallbackZone={zone} />],
    ["Patient", user.full_name || user.email],
    ["Doctor", appt.doctor?.display_name ?? "—"],
    ["Appointment", <LocalTime key="a" iso={appt.slot_start} fallbackZone={zone} />],
    ["Consultation", CONSULTATION_TYPE_LABEL[appt.consultation_type]],
    ["Payment method", payment.card_type ?? "Online"],
    ["Gateway reference", payment.bank_tran_id ?? "—"],
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/patient/appointments/${appt.id}`} className="text-sm font-medium text-teal-700 hover:underline">
          ← Back to appointment
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <Logo href="/patient" />
          <div className="text-right">
            <h1 className="text-xl font-bold text-slate-900">Payment receipt</h1>
            <p className="text-sm text-emerald-700">Paid</p>
          </div>
        </header>

        <dl className="mt-6 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 border-t border-slate-200 pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Consultation fee</span>
            <span className="font-medium">{formatFee(payment.amount)}</span>
          </div>
          {refunded > 0 && (
            <div className="mt-1 flex justify-between text-slate-600">
              <span>Refunded</span>
              <span>− {formatFee(refunded)}</span>
            </div>
          )}
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900">
            <span>Total paid</span>
            <span>{formatFee(Number(payment.amount) - refunded)}</span>
          </div>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Processed securely by SSLCommerz. Keep this receipt for your records. This is a computer-generated receipt.
        </p>
      </article>
    </div>
  );
}
