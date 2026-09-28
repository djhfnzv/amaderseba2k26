"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { flash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation/form-state";
import { REVIEW_TAGS } from "@/types/database";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DB functions raise readable messages for expected problems; hide the rest. */
function friendly(error: { code?: string; message: string }, context: string): string {
  if (error.code === "22023" || error.code === "P0002" || error.code === "42501") return error.message;
  console.error(`[${context}]`, error);
  return "Something went wrong. Please try again.";
}

function revalidateReviews() {
  revalidatePath("/patient", "layout");
  revalidatePath("/doctor", "layout");
  revalidatePath("/admin/reviews");
  revalidatePath("/doctors", "layout");
}

// -----------------------------------------------------------------------------
// Patient
// -----------------------------------------------------------------------------
const reviewSchema = z.object({
  appointmentId: z.uuid("Invalid appointment."),
  rating: z.coerce.number().int().min(1, "Choose a star rating.").max(5, "Choose a star rating."),
  body: z.string().trim().max(1000, "Keep it under 1000 characters.").default(""),
  anonymous: z.string().optional(),
});

export async function saveReview(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("patient");
  const raw = formToObject(formData);
  const parsed = reviewSchema.safeParse(raw);
  const tags = formData.getAll("tags").map(String).filter((t) => (REVIEW_TAGS as readonly string[]).includes(t));
  if (!parsed.success) {
    return { error: "Please check your review.", fieldErrors: fieldErrorsOf(parsed.error), values: raw };
  }
  const { appointmentId, rating, body, anonymous } = parsed.data;
  const supabase = await createClient();
  const { data: existing } = await supabase.from("reviews").select("id").eq("appointment_id", appointmentId).maybeSingle();
  const { error } = await supabase.rpc("save_review", {
    p_appointment: appointmentId,
    p_rating: rating,
    p_tags: [...new Set(tags)],
    p_body: body || null,
    p_anonymous: anonymous === "on",
  });
  if (error) return { error: friendly(error, "saveReview"), values: raw };
  await flash(existing ? "Review updated" : "Thanks! Your review is live");
  revalidateReviews();
  return { message: existing ? "Your review was updated." : "Thanks for your review!" };
}

export async function deleteReview(formData: FormData): Promise<void> {
  await requireRole("patient");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_review", { p_review: id });
  if (error) console.error("[deleteReview]", error.message);
  else await flash("Review deleted");
  revalidateReviews();
}

// -----------------------------------------------------------------------------
// Doctor
// -----------------------------------------------------------------------------
export async function replyToReview(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("doctor");
  const id = String(formData.get("id") ?? "");
  // "Remove reply" submits remove=1.
  const body = formData.get("remove") ? "" : String(formData.get("reply") ?? "").trim();
  if (!UUID.test(id)) return { error: "Invalid review." };
  if (body.length > 1000) return { error: "Keep your reply under 1000 characters.", values: { reply: body } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_to_review", { p_review: id, p_body: body || null });
  if (error) return { error: friendly(error, "replyToReview"), values: { reply: body } };
  await flash(body ? "Reply posted" : "Reply removed");
  revalidateReviews();
  return { message: body ? "Reply posted." : "Reply removed." };
}

export async function reportReview(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("doctor");
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!UUID.test(id)) return { error: "Invalid review." };
  if (reason.length < 3) return { error: "Tell us briefly what's wrong.", values: { reason } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_review", { p_review: id, p_reason: reason.slice(0, 500) });
  if (error) return { error: friendly(error, "reportReview"), values: { reason } };
  await flash("Reported — an admin will take a look", "info");
  revalidateReviews();
  return { message: "Thanks — an admin will review it." };
}

// -----------------------------------------------------------------------------
// Admin (FR-A-06)
// -----------------------------------------------------------------------------
const moderateSchema = z.object({
  id: z.uuid(),
  action: z.enum(["hide", "restore", "dismiss"]),
  reason: z.string().trim().max(300, "Keep the reason under 300 characters.").default(""),
});

export async function moderateReview(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const raw = formToObject(formData);
  const parsed = moderateSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid request.", fieldErrors: fieldErrorsOf(parsed.error), values: raw };
  const { id, action, reason } = parsed.data;
  if (action === "hide" && !reason) return { error: "Give a reason — the patient will see it.", values: raw };
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_review", { p_review: id, p_action: action, p_reason: reason || null });
  if (error) return { error: friendly(error, "moderateReview"), values: raw };
  await flash(action === "hide" ? "Review hidden" : action === "restore" ? "Review restored" : "Flag dismissed");
  revalidateReviews();
  return { message: "Done." };
}
