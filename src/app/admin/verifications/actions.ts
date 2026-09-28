"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { flash } from "@/lib/flash";
import { kickSmsDispatch } from "@/lib/notifications/dispatch";
import { createClient } from "@/lib/supabase/server";
import { formToObject, type FormState } from "@/lib/validation/form-state";

const reviewSchema = z
  .object({
    requestId: z.uuid(),
    decision: z.enum(["approve", "reject", "revoke"]),
    reason: z.string().trim().max(1000, "Keep the reason under 1000 characters").optional(),
  })
  .refine((v) => v.decision === "approve" || (v.reason?.length ?? 0) >= 10, {
    path: ["reason"],
    message: "Explain the reason in at least 10 characters — the doctor will see it.",
  });

export async function reviewRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const raw = formToObject(formData);
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      fieldErrors: issue?.path[0] === "reason" ? { reason: [issue.message] } : undefined,
      error: issue?.path[0] === "reason" ? undefined : "Invalid request.",
      values: raw,
    };
  }
  const { requestId, decision, reason } = parsed.data;

  const supabase = await createClient();
  // The DB function re-checks admin rights and the current status.
  const { error } = await supabase.rpc("review_verification_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_reason: reason ?? null,
  });
  if (error) {
    const friendly = error.code === "22023" || error.code === "P0002";
    if (!friendly) console.error("[reviewRequest]", error);
    return { error: friendly ? `${error.message}.` : "Could not save the decision. Please try again.", values: raw };
  }

  await flash(decision === "approve" ? "Doctor approved" : decision === "reject" ? "Verification rejected" : "Verification revoked");
  kickSmsDispatch();
  revalidatePath("/admin", "layout");
  revalidatePath("/doctor", "layout");
  revalidatePath("/doctors/[slug]", "page");
  return {
    message:
      decision === "approve"
        ? "Approved. The doctor's page is now public."
        : decision === "reject"
          ? "Rejected. The doctor can see your reason and resubmit."
          : "Verification revoked. The doctor's page is no longer public.",
  };
}
