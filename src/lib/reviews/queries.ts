import "server-only";
import { PUBLIC_REVIEWS_PAGE, type ReviewSort } from "@/lib/reviews/constants";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { DoctorRatingStats, DoctorReview, PublicReview, Review } from "@/types/database";

export type ReviewPage = { reviews: PublicReview[]; total: number };

/** Rating summary for a doctor's page (null when there are no reviews yet). */
export async function getRatingStats(doctorId: string, asViewer = false): Promise<DoctorRatingStats | null> {
  const supabase = asViewer ? await createClient() : createPublicClient();
  const { data } = await supabase.from("doctor_rating_stats").select("*").eq("doctor_id", doctorId).maybeSingle();
  return data;
}

/** Published reviews for a doctor's page, without any patient identity. */
export async function listPublicReviews(
  doctorId: string,
  opts: { sort?: ReviewSort; offset?: number; limit?: number; asViewer?: boolean } = {},
): Promise<ReviewPage> {
  const supabase = opts.asViewer ? await createClient() : createPublicClient();
  const { data, error } = await supabase.rpc("doctor_public_reviews", {
    p_doctor: doctorId,
    p_sort: opts.sort ?? "newest",
    p_limit: opts.limit ?? PUBLIC_REVIEWS_PAGE,
    p_offset: opts.offset ?? 0,
  });
  if (error) {
    console.error("[listPublicReviews]", error.message);
    return { reviews: [], total: 0 };
  }
  const rows = data ?? [];
  const reviews = rows.map((row) => {
    const review: Partial<typeof row> = { ...row };
    delete review.total_count;
    return review as PublicReview;
  });
  return { reviews, total: Number(rows[0]?.total_count ?? 0) };
}

/** The signed-in patient's review of one appointment. */
export async function getMyReview(appointmentId: string): Promise<Review | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").select("*").eq("appointment_id", appointmentId).maybeSingle();
  return data;
}

/** The signed-in doctor's reviews (patients shown as "Rahim K." / anonymous). */
export async function listMyDoctorReviews(filter: "all" | "unreplied" = "all"): Promise<DoctorReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_doctor_reviews", { p_filter: filter, p_limit: 100 });
  if (error) console.error("[listMyDoctorReviews]", error.message);
  return data ?? [];
}

// -----------------------------------------------------------------------------
// Admin moderation queue
// -----------------------------------------------------------------------------
export type ModerationTab = "queue" | "hidden" | "all";

export type ModerationRow = Review & {
  doctor_name: string | null;
  doctor_slug: string | null;
  patient_name: string | null;
  reports: { reason: string; created_at: string; resolved_at: string | null }[];
};

export async function listForModeration(tab: ModerationTab): Promise<ModerationRow[]> {
  const supabase = await createClient();
  let query = supabase.from("reviews").select("*").order("created_at", { ascending: false }).limit(100);
  if (tab === "queue") query = query.eq("flagged", true).eq("status", "published");
  if (tab === "hidden") query = query.eq("status", "hidden");
  const { data } = await query;
  const rows = data ?? [];
  if (!rows.length) return [];

  const doctorIds = [...new Set(rows.map((r) => r.doctor_id))];
  const patientIds = [...new Set(rows.map((r) => r.patient_id))];
  const [doctors, patients, reports] = await Promise.all([
    supabase.from("doctor_profiles").select("user_id, display_name, slug").in("user_id", doctorIds),
    supabase.from("users").select("id, full_name, email").in("id", patientIds),
    supabase.from("review_reports").select("review_id, reason, created_at, resolved_at").in("review_id", rows.map((r) => r.id)),
  ]);
  const doctorBy = new Map((doctors.data ?? []).map((d) => [d.user_id, d]));
  const patientBy = new Map((patients.data ?? []).map((p) => [p.id, p.full_name || p.email]));
  return rows.map((r) => ({
    ...r,
    doctor_name: doctorBy.get(r.doctor_id)?.display_name ?? null,
    doctor_slug: doctorBy.get(r.doctor_id)?.slug ?? null,
    patient_name: patientBy.get(r.patient_id) ?? null,
    reports: (reports.data ?? []).filter((x) => x.review_id === r.id),
  }));
}

export async function moderationCounts(): Promise<{ queue: number; hidden: number }> {
  const supabase = await createClient();
  const [queue, hidden] = await Promise.all([
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("flagged", true).eq("status", "published"),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "hidden"),
  ]);
  return { queue: queue.count ?? 0, hidden: hidden.count ?? 0 };
}
