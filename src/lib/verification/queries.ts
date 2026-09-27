import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioDetails, type PortfolioDetails } from "@/lib/doctor/queries";
import type {
  DoctorProfile,
  VerificationDocument,
  VerificationEvent,
  VerificationRequest,
  VerificationStatus,
} from "@/types/database";

// -----------------------------------------------------------------------------
// Doctor side
// -----------------------------------------------------------------------------

/** The doctor's request (null if they have never started one). */
export async function getOwnRequest(doctorId: string): Promise<VerificationRequest | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("doctor_id", doctorId)
    .maybeSingle();
  return data;
}

/** Returns the doctor's request, opening a draft on first use. Needs a doctor_profiles row. */
export async function getOrCreateOwnRequest(doctorId: string): Promise<VerificationRequest> {
  const existing = await getOwnRequest(doctorId);
  if (existing) return existing;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verification_requests")
    .insert({ doctor_id: doctorId, status: "draft" })
    .select("*")
    .single();
  if (data) return data;

  // A concurrent request may have created it first.
  const again = await getOwnRequest(doctorId);
  if (again) return again;
  throw new Error(`Could not open verification request: ${error?.message}`);
}

export async function listDocuments(requestId: string): Promise<VerificationDocument[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("verification_documents")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at");
  return data ?? [];
}

export async function listEvents(requestId: string): Promise<VerificationEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("verification_events")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

// -----------------------------------------------------------------------------
// Admin side (RLS: admins can read all of these)
// -----------------------------------------------------------------------------

export type QueueItem = VerificationRequest & {
  doctor: Pick<DoctorProfile, "display_name" | "slug" | "license_number" | "headline">;
  email: string | null;
  documentCount: number;
};

export async function listRequests(status: VerificationStatus | "all"): Promise<QueueItem[]> {
  const supabase = await createClient();
  let query = supabase.from("verification_requests").select("*");
  if (status === "all") {
    query = query.neq("status", "draft");
  } else {
    query = query.eq("status", status);
  }
  // Oldest waiting first for the pending queue; most recent first otherwise.
  const { data: requests } = await query.order(status === "pending" ? "submitted_at" : "updated_at", {
    ascending: status === "pending",
  });
  if (!requests?.length) return [];

  const ids = requests.map((r) => r.doctor_id);
  const [profiles, users, docs] = await Promise.all([
    supabase.from("doctor_profiles").select("user_id, display_name, slug, license_number, headline").in("user_id", ids),
    supabase.from("users").select("id, email").in("id", ids),
    supabase.from("verification_documents").select("request_id").in("request_id", requests.map((r) => r.id)),
  ]);

  const profileBy = new Map((profiles.data ?? []).map((p) => [p.user_id, p]));
  const emailBy = new Map((users.data ?? []).map((u) => [u.id, u.email]));
  const docCount = new Map<string, number>();
  for (const d of docs.data ?? []) docCount.set(d.request_id, (docCount.get(d.request_id) ?? 0) + 1);

  return requests.map((r) => ({
    ...r,
    doctor: profileBy.get(r.doctor_id) ?? { display_name: "Unknown doctor", slug: "", license_number: null, headline: null },
    email: emailBy.get(r.doctor_id) ?? null,
    documentCount: docCount.get(r.id) ?? 0,
  }));
}

export async function countPending(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("verification_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

export type RequestDetail = {
  request: VerificationRequest;
  profile: DoctorProfile;
  account: { email: string | null; full_name: string; status: string; created_at: string };
  details: PortfolioDetails;
  documents: VerificationDocument[];
  events: (VerificationEvent & { actorName: string | null })[];
};

export async function getRequestDetail(requestId: string): Promise<RequestDetail | null> {
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return null;

  const [profile, account, details, documents, events] = await Promise.all([
    supabase.from("doctor_profiles").select("*").eq("user_id", request.doctor_id).single(),
    supabase.from("users").select("email, full_name, status, created_at").eq("id", request.doctor_id).single(),
    getPortfolioDetails(request.doctor_id),
    listDocuments(request.id),
    listEvents(request.id),
  ]);
  if (!profile.data || !account.data) return null;

  const actorIds = [...new Set(events.map((e) => e.actor_id).filter((id): id is string => !!id))];
  const { data: actors } = actorIds.length
    ? await supabase.from("users").select("id, full_name, email").in("id", actorIds)
    : { data: [] };
  const actorBy = new Map((actors ?? []).map((a) => [a.id, a.full_name || a.email]));

  return {
    request,
    profile: profile.data,
    account: account.data,
    details,
    documents,
    events: events.map((e) => ({ ...e, actorName: e.actor_id ? (actorBy.get(e.actor_id) ?? null) : null })),
  };
}
