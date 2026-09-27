"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireUser } from "@/lib/auth/guards";
import { refundAppointment, startPaymentFor } from "@/lib/payments/service";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/form-state";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** DB functions raise readable messages for expected problems; hide the rest. */
function friendly(error: { code?: string; message: string }, context: string): string {
  if (error.code === "22023" || error.code === "P0002" || error.code === "42501") return error.message;
  console.error(`[${context}]`, error);
  return "Something went wrong. Please try again.";
}

function isIsoInstant(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
}

function revalidateAppointments() {
  revalidatePath("/patient", "layout");
  revalidatePath("/doctor", "layout");
  revalidatePath("/doctors/[slug]", "page");
}

// -----------------------------------------------------------------------------
// Booking: pick slot -> 5-minute hold -> confirm
// -----------------------------------------------------------------------------
export async function startBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const doctorId = String(formData.get("doctorId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const slotStart = String(formData.get("slotStart") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!UUID.test(doctorId) || !SLUG.test(slug) || !isIsoInstant(slotStart) || (type !== "online" && type !== "in_person")) {
    return { error: "Please choose a time slot." };
  }

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/doctors/${slug}`)}`);
  if (user.role !== "patient") {
    return { error: "Only patient accounts can book appointments. Log in with a patient account." };
  }

  const supabase = await createClient();
  const { data: holdId, error } = await supabase.rpc("hold_slot", {
    p_doctor: doctorId,
    p_slot_start: slotStart,
    p_type: type,
  });
  if (error || !holdId) return { error: error ? friendly(error, "startBooking") : "Could not reserve the slot." };

  redirect(`/patient/book/${holdId}`);
}

export async function confirmBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const holdId = String(formData.get("holdId") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!UUID.test(holdId)) return { error: "Invalid booking." };

  const payAtChamber = formData.get("payment") === "at_chamber";

  const supabase = await createClient();
  const { data: appointmentId, error } = await supabase.rpc("confirm_booking", {
    p_hold: holdId,
    p_note: note || null,
    p_pay_at_chamber: payAtChamber,
  });
  if (error || !appointmentId) return { error: error ? friendly(error, "confirmBooking") : "Could not confirm." };
  revalidateAppointments();

  const { data: appt } = await supabase.from("appointments").select("status").eq("id", appointmentId).single();
  if (appt?.status !== "pending_payment") redirect(`/patient/appointments/${appointmentId}?booked=1`);

  // Online payment: go straight to the gateway. If that fails, the patient can retry from the appointment page.
  const started = await startPaymentFor(appointmentId);
  if ("error" in started) redirect(`/patient/appointments/${appointmentId}?payment=error`);
  redirect(started.redirectUrl);
}

/** Pay (or retry paying) for an appointment that is awaiting payment. */
export async function payForAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const id = String(formData.get("appointmentId") ?? "");
  if (!UUID.test(id)) return { error: "Invalid appointment." };

  const started = await startPaymentFor(id);
  if ("error" in started) return { error: started.error };
  redirect(started.redirectUrl);
}

export async function releaseHold(formData: FormData): Promise<void> {
  await requireUser();
  const holdId = String(formData.get("holdId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (UUID.test(holdId)) {
    const supabase = await createClient();
    await supabase.rpc("release_hold", { p_hold: holdId });
  }
  // Holds belong to patients, so return to the in-dashboard doctor page.
  redirect(SLUG.test(slug) ? `/patient/doctors/${slug}` : "/patient/doctors");
}

// -----------------------------------------------------------------------------
// Changes (the DB decides who may do what)
// -----------------------------------------------------------------------------
export async function cancelAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!UUID.test(id)) return { error: "Invalid appointment." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_appointment", { p_id: id, p_reason: reason || null });
  if (error) return { error: friendly(error, "cancelAppointment"), values: { reason } };

  // Paid online? Issue the refund the policy allows.
  await refundAppointment(id);

  revalidateAppointments();
  return { message: "The appointment has been cancelled. Any refund due is on its way." };
}

export async function rescheduleAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const id = String(formData.get("appointmentId") ?? "");
  const slotStart = String(formData.get("slotStart") ?? "");
  if (!UUID.test(id) || !isIsoInstant(slotStart)) return { error: "Please choose a new time." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reschedule_appointment", { p_id: id, p_new_start: slotStart });
  if (error) return { error: friendly(error, "rescheduleAppointment") };

  revalidateAppointments();
  return { message: "Rescheduled. Both you and the other party can see the new time." };
}

export async function updateAppointmentStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!UUID.test(id) || !["start", "complete", "no_show"].includes(action)) return { error: "Invalid request." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_appointment_status", {
    p_id: id,
    p_action: action as "start" | "complete" | "no_show",
  });
  if (error) return { error: friendly(error, "updateAppointmentStatus") };

  revalidateAppointments();
  return { message: action === "start" ? "Consultation started." : action === "complete" ? "Marked as completed." : "Marked as no-show." };
}
