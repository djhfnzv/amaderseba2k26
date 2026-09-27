import Link from "next/link";
import { LocalTime } from "@/components/ui/local-time";
import { formatFee } from "@/lib/doctor/constants";
import type { PaymentSummary } from "@/lib/payments/queries";
import type { Appointment, PlatformSettings } from "@/types/database";
import { PayButton } from "./pay-button";

const REFUND_STATUS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  succeeded: "Refunded",
  failed: "Failed — our team will retry",
};

/** Payment status, pay/retry button, refunds and receipt link for a patient's appointment. */
export function PaymentPanel({
  appointment,
  summary,
  settings,
  showActions,
  receiptHref,
}: {
  appointment: Appointment;
  summary: PaymentSummary;
  settings: PlatformSettings;
  showActions: boolean;
  receiptHref?: string;
}) {
  const { payment, refunds } = summary;
  const paid = payment?.status === "paid";
  const awaiting = appointment.status === "pending_payment";

  return (
    <div className="flex flex-col gap-4 text-sm">
      {awaiting && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <p className="font-semibold">Payment needed to confirm this appointment</p>
          {appointment.payment_due_at && (
            <p className="mt-0.5">
              Complete it by <LocalTime iso={appointment.payment_due_at} format="time" /> or the slot is released.
            </p>
          )}
          {showActions && (
            <div className="mt-3">
              <PayButton
                appointmentId={appointment.id}
                label={summary.attempts > 0 ? `Try paying ${formatFee(appointment.fee)} again` : `Pay ${formatFee(appointment.fee)}`}
              />
            </div>
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3">
        <Item label="Amount">{formatFee(appointment.fee)}</Item>
        <Item label="Method">
          {appointment.payment_method === "at_chamber" ? "Pay at the chamber" : paid ? (payment?.card_type ?? "Online") : "Online"}
        </Item>
        {paid && payment?.paid_at && (
          <Item label="Paid on">
            <LocalTime iso={payment.paid_at} />
          </Item>
        )}
        {paid && <Item label="Transaction">{payment!.tran_id}</Item>}
      </dl>

      {refunds.length > 0 && (
        <div>
          <p className="mb-1.5 font-medium text-slate-900">Refunds</p>
          <ul className="flex flex-col gap-2">
            {refunds.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>
                  {r.amount > 0 ? formatFee(r.amount) : "No refund"}
                  {r.amount === 0 && r.reason && <span className="text-slate-500"> — {r.reason}</span>}
                </span>
                <span className="text-slate-600">{r.amount > 0 ? REFUND_STATUS[r.status] : ""}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-slate-500">Refunds reach your card or wallet in 7–10 working days.</p>
        </div>
      )}

      {paid && appointment.status !== "cancelled" && (
        <p className="text-xs text-slate-500">
          Refund policy: full refund if you cancel {settings.refund_full_hours}+ hours before, {settings.refund_partial_percent}%
          if later (you can cancel up to 2 hours before). Full refund if the doctor cancels.
        </p>
      )}

      {paid && receiptHref && (
        <Link href={receiptHref} className="font-semibold text-teal-700 hover:underline">
          View receipt →
        </Link>
      )}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-all font-medium text-slate-900">{children}</dd>
    </div>
  );
}
