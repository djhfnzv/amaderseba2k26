import type { AppointmentAction, AppointmentStatus, PaymentMethod, PaymentStatus } from "@/types/database";

/** Keep in sync with the M7 migration. */
export const HOLD_MINUTES = 5;
export const PATIENT_CHANGE_CUTOFF_HOURS = 2;

export const APPOINTMENT_STATUS: Record<AppointmentStatus, { label: string; tone: string }> = {
  pending_payment: { label: "Awaiting payment", tone: "bg-amber-100 text-amber-900" },
  confirmed: { label: "Confirmed", tone: "bg-teal-100 text-teal-900" },
  in_progress: { label: "In progress", tone: "bg-sky-100 text-sky-900" },
  completed: { label: "Completed", tone: "bg-emerald-100 text-emerald-900" },
  cancelled: { label: "Cancelled", tone: "bg-slate-200 text-slate-700" },
  expired: { label: "Expired", tone: "bg-slate-200 text-slate-700" },
  no_show: { label: "No-show", tone: "bg-red-100 text-red-800" },
};

export const EVENT_LABEL: Record<AppointmentAction, string> = {
  booked: "Booked",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  started: "Consultation started",
  completed: "Completed",
  no_show: "Marked as no-show",
  payment_received: "Payment received",
  expired: "Expired — payment not completed",
  refunded: "Refunded",
};

/** Short, human payment state for an appointment. */
export function paymentLabel(
  method: PaymentMethod,
  status: PaymentStatus,
  appointmentStatus?: AppointmentStatus,
): string {
  if (status === "paid") return "Paid online";
  if (status === "refunded") return "Refunded";
  if (status === "partially_refunded") return "Partly refunded";
  if (status === "waived") return "No charge";
  if (method === "at_chamber") return "Pay at the chamber";
  return appointmentStatus === "pending_payment" ? "Awaiting payment" : "Not paid";
}

export const isLive = (s: AppointmentStatus) => s === "pending_payment" || s === "confirmed";

/** Patients can change a live appointment until 2 hours before it starts. */
export function patientCanChange(status: AppointmentStatus, slotStart: string, now = Date.now()): boolean {
  return isLive(status) && new Date(slotStart).getTime() - now >= PATIENT_CHANGE_CUTOFF_HOURS * 3600_000;
}
