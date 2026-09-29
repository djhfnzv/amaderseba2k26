import "server-only";
import { env } from "@/lib/env";
import { kickSmsDispatch } from "@/lib/notifications/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PaymentProvider } from "@/types/database";
import { activeProvider, gatewayFor } from "./config";

function callbackUrls(provider: PaymentProvider) {
  const base = `${env.siteUrl.replace(/\/$/, "")}/api/payments/${provider}`;
  return { success: `${base}/success`, fail: `${base}/fail`, cancel: `${base}/cancel`, ipn: `${base}/ipn` };
}

function friendly(error: { code?: string; message: string }): string {
  return ["22023", "P0002", "42501"].includes(error.code ?? "") ? error.message : "Could not start the payment. Please try again.";
}

// -----------------------------------------------------------------------------
// Start (or retry) paying for an appointment — runs as the signed-in patient.
// -----------------------------------------------------------------------------
export async function startPaymentFor(appointmentId: string): Promise<{ redirectUrl: string } | { error: string }> {
  const provider = activeProvider();
  const supabase = await createClient();

  const { data: rows, error } = await supabase.rpc("begin_payment", { p_appointment: appointmentId, p_provider: provider });
  const payment = rows?.[0];
  if (error || !payment) return { error: error ? friendly(error) : "Could not start the payment." };

  const { data: appt } = await supabase
    .from("appointments")
    .select("patient_id, doctor_id, consultation_type")
    .eq("id", appointmentId)
    .single();
  const [{ data: patient }, { data: doctor }] = await Promise.all([
    supabase.from("users").select("full_name, email, phone").eq("id", appt!.patient_id).single(),
    supabase.from("doctor_profiles").select("display_name").eq("user_id", appt!.doctor_id).maybeSingle(),
  ]);

  const result = await gatewayFor(provider).initiate({
    tranId: payment.tran_id,
    amount: Number(payment.amount),
    currency: payment.currency,
    appointmentId,
    customer: {
      name: patient?.full_name || "MedLife patient",
      email: patient?.email || "patient@medlife.local",
      phone: patient?.phone || "01700000000",
    },
    productName: `Consultation with ${doctor?.display_name ?? "doctor"} (${appt!.consultation_type === "online" ? "online" : "in-person"})`,
    urls: callbackUrls(provider),
  });

  if (!result.ok) {
    console.error("[startPaymentFor]", result.error);
    await createAdminClient().rpc("fail_payment", { p_tran_id: payment.tran_id, p_status: "failed", p_data: { init_error: result.error } });
    return { error: "The payment gateway is not responding. Please try again in a moment." };
  }
  return { redirectUrl: result.redirectUrl };
}

// -----------------------------------------------------------------------------
// Gateway callbacks — cross-site POSTs without our cookies, so they run with
// the secret key and trust only the server-to-server validation.
// -----------------------------------------------------------------------------
export type CallbackOutcome = {
  appointmentId: string | null;
  result: "paid" | "refunding" | "failed" | "cancelled" | "invalid";
};

export async function handleGatewayCallback(
  provider: PaymentProvider,
  event: "success" | "fail" | "cancel" | "ipn",
  fields: Record<string, string>,
): Promise<CallbackOutcome> {
  const admin = createAdminClient();
  const tranId = fields.tran_id ?? "";
  if (!/^[A-Za-z0-9-]{6,40}$/.test(tranId)) return { appointmentId: null, result: "invalid" };

  const { data: payment } = await admin
    .from("payments")
    .select("appointment_id, provider, status")
    .eq("tran_id", tranId)
    .maybeSingle();
  if (!payment || payment.provider !== provider) return { appointmentId: null, result: "invalid" };

  if (event === "fail" || event === "cancel") {
    await admin.rpc("fail_payment", {
      p_tran_id: tranId,
      p_status: event === "fail" ? "failed" : "cancelled",
      p_data: { status: fields.status ?? null, error: fields.error ?? null },
    });
    return { appointmentId: payment.appointment_id, result: event === "fail" ? "failed" : "cancelled" };
  }

  // success / ipn: the gateway's word must be confirmed server-to-server.
  const valId = fields.val_id ?? "";
  if (!valId) return { appointmentId: payment.appointment_id, result: "failed" };
  const check = await gatewayFor(provider).validate(valId, tranId);
  if (!check.ok) {
    console.error("[payment validate]", tranId, check.error);
    if (payment.status === "initiated") {
      await admin.rpc("fail_payment", { p_tran_id: tranId, p_status: "failed", p_data: { validation_error: check.error } });
    }
    return { appointmentId: payment.appointment_id, result: "failed" };
  }

  const { data: done, error } = await admin.rpc("complete_payment", {
    p_tran_id: tranId,
    p_val_id: check.valId,
    p_bank_tran_id: check.bankTranId,
    p_amount: check.amount,
    p_card_type: check.cardType,
    p_data: check.raw,
  });
  if (error || !done?.[0]) {
    console.error("[complete_payment]", tranId, error);
    return { appointmentId: payment.appointment_id, result: "failed" };
  }
  kickSmsDispatch();

  if (done[0].needs_refund) {
    await refundAppointment(done[0].appointment_id);
    return { appointmentId: done[0].appointment_id, result: "refunding" };
  }
  return { appointmentId: done[0].appointment_id, result: "paid" };
}

// -----------------------------------------------------------------------------
// Refunds
// -----------------------------------------------------------------------------
async function sendRefund(
  ticket: { refund_id: string; amount: number; bank_tran_id: string | null; provider: PaymentProvider; tran_id: string },
  remarks = "MedLife appointment cancelled",
) {
  const admin = createAdminClient();
  const res = await gatewayFor(ticket.provider).refund({
    bankTranId: ticket.bank_tran_id,
    tranId: ticket.tran_id,
    amount: Number(ticket.amount),
    refundId: ticket.refund_id,
    remarks,
  });
  kickSmsDispatch();
  await admin.rpc("finish_refund", {
    p_refund: ticket.refund_id,
    p_success: res.ok,
    p_ref: res.ok ? res.ref : null,
    p_error: res.ok ? null : res.error,
  });
  if (!res.ok) console.error("[refund]", ticket.refund_id, res.error);
  return res.ok;
}

/** Issues the policy refund for one cancelled/unfulfilled paid appointment (no-op otherwise). */
export async function refundAppointment(appointmentId: string): Promise<void> {
  const { data, error } = await createAdminClient().rpc("create_refund_for", { p_appointment: appointmentId });
  if (error) {
    console.error("[create_refund_for]", appointmentId, error.message);
    return;
  }
  if (data?.[0]) await sendRefund(data[0]);
}

/** Catches up on any paid appointments that were cancelled without a refund yet. */
export async function processPendingRefunds(limit = 50): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("appointments")
    .select("id")
    .in("status", ["cancelled", "expired"])
    .eq("payment_status", "paid")
    .limit(limit);
  for (const row of data ?? []) await refundAppointment(row.id);
}

export async function retryRefund(refundId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await createAdminClient().rpc("retry_refund", { p_refund: refundId });
  if (error || !data?.[0]) return { ok: false, error: error?.message ?? "Could not retry this refund." };
  const ok = await sendRefund(data[0]);
  return ok ? { ok } : { ok, error: "The gateway rejected the refund again. See the error on the refund." };
}

/**
 * Refund part/all of a payment while resolving a complaint (M13). The caller
 * must already have checked that the signed-in user is an admin.
 */
export async function refundForComplaint(
  complaintId: string,
  amount: number,
  adminId: string,
): Promise<{ ok: true; sent: boolean } | { ok: false; error: string }> {
  const { data, error } = await createAdminClient().rpc("create_complaint_refund", {
    p_complaint: complaintId,
    p_amount: amount,
    p_admin: adminId,
  });
  if (error || !data?.[0]) {
    const readable = error && ["22023", "P0002", "42501"].includes(error.code ?? "");
    if (error && !readable) console.error("[refundForComplaint]", error.message);
    return { ok: false, error: readable ? error!.message : "Could not start the refund." };
  }
  const sent = await sendRefund(data[0], "MedLife complaint refund");
  return { ok: true, sent };
}
