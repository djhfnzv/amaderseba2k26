"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit/log";
import { requireRole } from "@/lib/auth/guards";
import { flash } from "@/lib/flash";
import { kickSmsDispatch } from "@/lib/notifications/dispatch";
import { processPendingRefunds } from "@/lib/payments/service";
import { clearLoginFailures } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formToObject, type FormState } from "@/lib/validation/form-state";

/** Effectively permanent ban at the Auth layer (~100 years); "none" lifts it. */
const BAN_FOREVER = "876000h";

const schema = z
  .object({
    userId: z.uuid(),
    status: z.enum(["suspended", "active"]),
    reason: z.string().trim().max(1000, "Keep the reason under 1000 characters").optional(),
  })
  .refine((v) => v.status === "active" || (v.reason?.length ?? 0) >= 10, {
    path: ["reason"],
    message: "Give a reason of at least 10 characters — the user will see it.",
  });

export async function setUserStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const raw = formToObject(formData);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue?.path[0] === "reason"
      ? { fieldErrors: { reason: [issue.message] }, values: raw }
      : { error: "Invalid request.", values: raw };
  }
  const { userId, status, reason } = parsed.data;

  // 1) Source of truth: DB function (checks admin rights, cancels upcoming bookings, audits).
  const supabase = await createClient();
  const { data: cancelled, error } = await supabase.rpc("admin_set_user_status", {
    p_user: userId,
    p_status: status,
    p_reason: reason || null,
  });
  if (error) {
    const expected = ["22023", "P0002", "42501"].includes(error.code ?? "");
    if (!expected) console.error("[setUserStatus]", error);
    return { error: expected ? error.message : "Could not update the account. Please try again.", values: raw };
  }

  kickSmsDispatch();

  // 2) Defence in depth: stop the account from signing in or refreshing its session.
  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: status === "suspended" ? BAN_FOREVER : "none",
  });
  if (banError) console.error("[setUserStatus ban]", banError.message);

  // Upcoming appointments cancelled by a suspension get their refunds now.
  if (status === "suspended") await processPendingRefunds();

  revalidatePath("/admin", "layout");
  revalidatePath("/doctors");
  revalidatePath("/doctors/[slug]", "page");

  await flash(status === "active" ? "Account reactivated" : "Account suspended");
  if (status === "active") return { message: "Account reactivated. The user can log in again." };
  return {
    message:
      cancelled && cancelled > 0
        ? `Account suspended. ${cancelled} upcoming appointment${cancelled === 1 ? " was" : "s were"} cancelled.`
        : "Account suspended.",
  };
}

/** Lifts a login lock-out (too many wrong passwords) before it expires. */
export async function unlockLogin(formData: FormData): Promise<void> {
  await requireRole("admin");
  const userId = String(formData.get("userId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return;
  const { data: target } = await createAdminClient().from("users").select("email").eq("id", userId).maybeSingle();
  if (!target?.email) return;
  await clearLoginFailures(target.email);
  await audit({ category: "security", action: "account.unlock", targetType: "user", targetId: userId });
  revalidatePath(`/admin/users/${userId}`);
}
