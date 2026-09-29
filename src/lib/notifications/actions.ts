"use server";

import { rateLimit, requestIp } from "@/lib/security/rate-limit";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { flash } from "@/lib/flash";
import { dispatchSms } from "@/lib/notifications/dispatch";
import { normalizeBdPhone } from "@/lib/sms/phone";
import { sendSms, smsIsLive } from "@/lib/sms/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/form-state";
import type { AppNotification } from "@/types/database";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_TTL_MS = 10 * 60_000;
const RESEND_AFTER_MS = 60_000;
const MAX_SENDS_PER_DAY = 5;
const MAX_CODE_ATTEMPTS = 5;

// -----------------------------------------------------------------------------
// In-app
// -----------------------------------------------------------------------------
export async function loadRecentNotifications(): Promise<Result<{ items: AppNotification[]; unread: number }>> {
  const user = await requireUser();
  const supabase = await createClient();
  const [list, count] = await Promise.all([
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  if (list.error) return { ok: false, error: "Couldn't load notifications." };
  return { ok: true, data: { items: list.data ?? [], unread: count.count ?? 0 } };
}

export async function markNotificationsRead(ids?: string[]): Promise<Result<number>> {
  await requireUser();
  const clean = ids?.filter((id) => UUID.test(id)).slice(0, 200);
  if (ids && !clean?.length) return { ok: true, data: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: clean ?? null });
  if (error) return { ok: false, error: "Couldn't update notifications." };
  revalidatePath("/", "layout");
  return { ok: true, data: data ?? 0 };
}

export async function markAllReadForm(): Promise<void> {
  await markNotificationsRead();
}

// -----------------------------------------------------------------------------
// SMS number (verified by a one-time code) and on/off switch
// -----------------------------------------------------------------------------
function hashCode(userId: string, phone: string, code: string): string {
  const key = process.env.SUPABASE_SECRET_KEY ?? "medlife";
  return createHmac("sha256", key).update(`${userId}:${phone}:${code}`).digest("hex");
}

function revalidateSettings() {
  revalidatePath("/patient/notifications");
  revalidatePath("/doctor/notifications");
}

export async function requestPhoneCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role === "admin") return { error: "SMS alerts are for patients and doctors." };
  const raw = String(formData.get("phone") ?? "");
  const phone = normalizeBdPhone(raw);
  if (!phone) {
    return { error: "Enter a Bangladeshi mobile number, e.g. 01712-345678.", fieldErrors: { phone: ["Invalid number"] }, values: { phone: raw } };
  }

  const [byPhone, byIp] = await Promise.all([rateLimit("sms_code_phone", phone, { hash: true }), rateLimit("sms_code_ip", await requestIp())]);
  if (!byPhone.ok || !byIp.ok) {
    return { error: `Too many codes requested. Please try again in ${!byPhone.ok ? byPhone.retryAfter : byIp.ok ? "" : byIp.retryAfter}.`, values: { phone: raw } };
  }

  const admin = createAdminClient();
  const { data: prev } = await admin.from("sms_verifications").select("*").eq("user_id", user.id).maybeSingle();
  const now = Date.now();
  if (prev && now - Date.parse(prev.last_sent_at) < RESEND_AFTER_MS) {
    return { error: "Please wait a minute before asking for another code.", values: { phone: raw, step: "code" } };
  }
  const windowFresh = !prev || now - Date.parse(prev.window_started_at) > 24 * 3600_000;
  const sends = windowFresh ? 0 : prev.sends_in_window;
  if (sends >= MAX_SENDS_PER_DAY) return { error: "Too many codes today. Please try again tomorrow.", values: { phone: raw } };

  const code = String(randomInt(100000, 1000000));
  const { error } = await admin.from("sms_verifications").upsert({
    user_id: user.id,
    phone,
    code_hash: hashCode(user.id, phone, code),
    expires_at: new Date(now + CODE_TTL_MS).toISOString(),
    attempts: 0,
    sends_in_window: sends + 1,
    window_started_at: windowFresh ? new Date(now).toISOString() : prev!.window_started_at,
    last_sent_at: new Date(now).toISOString(),
  });
  if (error) {
    console.error("[requestPhoneCode]", error.message);
    return { error: "Something went wrong. Please try again.", values: { phone: raw } };
  }

  const sent = await sendSms(phone, `MedLife: Your verification code is ${code}. It expires in 10 minutes. Don't share it with anyone.`);
  if (!sent.ok) {
    console.error("[requestPhoneCode] send", sent.error);
    return { error: "We couldn't send the SMS. Check the number and try again.", values: { phone: raw } };
  }
  return {
    message: smsIsLive()
      ? "We sent a 6-digit code to your phone."
      : `SMS is in test mode, so nothing was sent. Your code is ${code}.`,
    values: { phone: raw, step: "code" },
  };
}

export async function verifyPhoneCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const phoneRaw = String(formData.get("phone") ?? "");
  if (code.length !== 6) return { error: "Enter the 6-digit code.", values: { phone: phoneRaw, step: "code" } };

  const admin = createAdminClient();
  const { data: v } = await admin.from("sms_verifications").select("*").eq("user_id", user.id).maybeSingle();
  if (!v || Date.parse(v.expires_at) < Date.now()) {
    return { error: "The code has expired. Ask for a new one.", values: { phone: phoneRaw } };
  }
  if (v.attempts >= MAX_CODE_ATTEMPTS) {
    return { error: "Too many wrong attempts. Ask for a new code.", values: { phone: phoneRaw } };
  }

  const expected = Buffer.from(v.code_hash, "hex");
  const given = Buffer.from(hashCode(user.id, v.phone, code), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await admin.from("sms_verifications").update({ attempts: v.attempts + 1 }).eq("user_id", user.id);
    return { error: "That code isn't right.", values: { phone: phoneRaw, step: "code" } };
  }

  const { error } = await admin.from("notification_preferences").upsert({
    user_id: user.id,
    sms_phone: v.phone,
    sms_phone_verified_at: new Date().toISOString(),
    sms_enabled: true,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[verifyPhoneCode]", error.message);
    return { error: "Something went wrong. Please try again.", values: { phone: phoneRaw, step: "code" } };
  }
  await admin.from("sms_verifications").delete().eq("user_id", user.id);
  revalidateSettings();
  await flash("Mobile number confirmed");
  return { message: "Number confirmed. You'll get SMS alerts on it." };
}

export async function setSmsEnabled(formData: FormData): Promise<void> {
  const user = await requireUser();
  const enabled = formData.get("enabled") === "true";
  const admin = createAdminClient();
  await admin
    .from("notification_preferences")
    .upsert({ user_id: user.id, sms_enabled: enabled, updated_at: new Date().toISOString() });
  await flash(enabled ? "SMS alerts turned on" : "SMS alerts turned off");
  if (!enabled) {
    await admin.from("sms_outbox").update({ status: "cancelled", error: "SMS turned off by the user" }).eq("user_id", user.id).eq("status", "pending");
  }
  revalidateSettings();
}

export async function removeSmsPhone(): Promise<void> {
  const user = await requireUser();
  const admin = createAdminClient();
  await admin
    .from("notification_preferences")
    .upsert({ user_id: user.id, sms_phone: null, sms_phone_verified_at: null, updated_at: new Date().toISOString() });
  await flash("Mobile number removed");
  await admin.from("sms_outbox").update({ status: "cancelled", error: "Number removed by the user" }).eq("user_id", user.id).eq("status", "pending");
  revalidateSettings();
}

// -----------------------------------------------------------------------------
// Admin: SMS queue
// -----------------------------------------------------------------------------
export async function sendPendingSmsNow(): Promise<void> {
  await requireRole("admin");
  const r = await dispatchSms(50);
  await flash(`Sent ${r.sent}, failed ${r.failed}, retrying ${r.retrying}`, "info");
  revalidatePath("/admin/sms");
}

export async function retrySms(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const admin = createAdminClient();
  await admin
    .from("sms_outbox")
    .update({ status: "pending", not_before: new Date().toISOString(), attempts: 0, error: null })
    .eq("id", id)
    .in("status", ["failed", "cancelled"]);
  await dispatchSms(5);
  await flash("SMS retried", "info");
  revalidatePath("/admin/sms");
}
