"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { processPendingRefunds, retryRefund } from "@/lib/payments/service";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation/form-state";

// -----------------------------------------------------------------------------
// Platform settings (FR-A-04)
// -----------------------------------------------------------------------------
const settingsSchema = z.object({
  commissionPercent: z.coerce.number({ error: "Enter a number" }).min(0, "0–100").max(100, "0–100"),
  refundFullHours: z.coerce.number({ error: "Enter a number" }).int().min(2, "At least 2 hours").max(720, "At most 720 hours"),
  refundPartialPercent: z.coerce.number({ error: "Enter a number" }).int().min(0, "0–100").max(100, "0–100"),
  paymentWindowMinutes: z.coerce.number({ error: "Enter a number" }).int().min(5, "5–60 minutes").max(60, "5–60 minutes"),
});

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("admin");
  const raw = formToObject(formData);
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values: raw };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({
      commission_percent: Math.round(v.commissionPercent * 100) / 100,
      refund_full_hours: v.refundFullHours,
      refund_partial_percent: v.refundPartialPercent,
      payment_window_minutes: v.paymentWindowMinutes,
      updated_by: admin.id,
    })
    .eq("id", 1);
  if (error) {
    console.error("[saveSettings]", error);
    return { error: "Could not save the settings.", values: raw };
  }
  revalidatePath("/", "layout");
  return { message: "Settings saved. They apply to new payments and cancellations." };
}

// -----------------------------------------------------------------------------
// Payouts (FR-A-09)
// -----------------------------------------------------------------------------
const payoutSchema = z.object({
  doctorId: z.uuid(),
  amount: z.coerce.number({ error: "Enter an amount" }).positive("Enter an amount greater than zero"),
  method: z.enum(["bank", "bkash", "nagad", "cash", "other"]),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function recordPayout(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const raw = formToObject(formData);
  const parsed = payoutSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values: raw };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_record_payout", {
    p_doctor: v.doctorId,
    p_amount: v.amount,
    p_method: v.method,
    p_reference: v.reference || null,
    p_note: v.note || null,
  });
  if (error) {
    const expected = error.code === "22023" || error.code === "42501";
    if (!expected) console.error("[recordPayout]", error);
    return { error: expected ? error.message : "Could not record the payout.", values: raw };
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/doctor", "layout");
  return { message: "Payout recorded." };
}

// -----------------------------------------------------------------------------
// Refunds (FR-A-05)
// -----------------------------------------------------------------------------
export async function retryRefundAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const id = String(formData.get("refundId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid refund." };
  const res = await retryRefund(id);
  revalidatePath("/admin/payments");
  return res.ok ? { message: "Refund sent to the gateway." } : { error: res.error ?? "Retry failed." };
}

/** Issues any refunds that were missed (e.g. gateway was down during a cancellation). */
export async function catchUpRefunds(): Promise<void> {
  await requireRole("admin");
  await processPendingRefunds();
  revalidatePath("/admin/payments");
}
