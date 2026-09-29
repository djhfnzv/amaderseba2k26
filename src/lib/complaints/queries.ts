import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, Complaint, ComplaintMessage, ComplaintStatus } from "@/types/database";

export type ComplaintListRow = Pick<
  Complaint,
  "id" | "code" | "subject" | "category" | "status" | "priority" | "created_at" | "last_activity_at" | "complainant_role"
> & { complainant_name?: string | null };

const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 } as const;

const LIST = "id, code, subject, category, status, priority, created_at, last_activity_at, complainant_role, complainant_id";

/** The signed-in user's own complaints (RLS). */
export async function listMyComplaints(): Promise<ComplaintListRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("complaints").select(LIST).order("last_activity_at", { ascending: false }).limit(100);
  return data ?? [];
}

export async function listComplaintQueue(
  tab: ComplaintStatus | "active" | "all",
  q = "",
): Promise<{ rows: ComplaintListRow[]; counts: Record<string, number> }> {
  const supabase = await createClient();
  let query = supabase.from("complaints").select(LIST).limit(200);
  if (tab === "active") query = query.in("status", ["open", "in_review"]);
  else if (tab !== "all") query = query.eq("status", tab);
  const term = q.replace(/[%_,()"\\]/g, " ").trim().slice(0, 60);
  if (term) query = query.or(`code.ilike."%${term}%",subject.ilike."%${term}%"`);
  const waiting = tab === "active" || tab === "open" || tab === "in_review";
  query = query.order("last_activity_at", { ascending: waiting });

  const head = { count: "exact" as const, head: true };
  const [{ data }, open, review] = await Promise.all([
    query,
    supabase.from("complaints").select("id", head).eq("status", "open"),
    supabase.from("complaints").select("id", head).eq("status", "in_review"),
  ]);
  const rows = data ?? [];
  // Queue: urgent first, then the ones waiting longest.
  if (waiting) rows.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  const ids = [...new Set(rows.map((r) => r.complainant_id))];
  const { data: users } = ids.length
    ? await supabase.from("users").select("id, full_name, email").in("id", ids)
    : { data: [] as Pick<AppUser, "id" | "full_name" | "email">[] };
  const names = new Map((users ?? []).map((u) => [u.id, u.full_name || u.email]));
  return {
    rows: rows.map((r) => ({ ...r, complainant_name: names.get(r.complainant_id) ?? null })),
    counts: { open: open.count ?? 0, in_review: review.count ?? 0 },
  };
}

export type ComplaintDetail = Complaint & {
  messages: (ComplaintMessage & { author_name: string | null })[];
  complainant: Pick<AppUser, "id" | "full_name" | "email" | "phone" | "role" | "status"> | null;
  against: Pick<AppUser, "id" | "full_name" | "email" | "role"> | null;
  appointment: {
    id: string;
    slot_start: string;
    consultation_type: string;
    status: string;
    fee: number | null;
    payment_status: string;
    doctor_name: string | null;
    patient_name: string | null;
  } | null;
  payment: { amount: number; refunded: number; refundable: number } | null;
};

export async function getComplaint(id: string): Promise<ComplaintDetail | null> {
  const supabase = await createClient();
  const { data: c } = await supabase.from("complaints").select("*").eq("id", id).maybeSingle();
  if (!c) return null;

  const [{ data: messages }, { data: people }, apptRes] = await Promise.all([
    supabase.from("complaint_messages").select("*").eq("complaint_id", id).order("created_at"),
    supabase
      .from("users")
      .select("id, full_name, email, phone, role, status")
      .in("id", [c.complainant_id, c.against_user_id].filter((x): x is string => !!x)),
    c.appointment_id
      ? supabase
          .from("appointments")
          .select("id, slot_start, consultation_type, status, fee, payment_status, doctor_id, patient_id")
          .eq("id", c.appointment_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const byId = new Map((people ?? []).map((u) => [u.id, u]));

  const authorIds = [...new Set((messages ?? []).map((m) => m.author_id).filter((x): x is string => !!x && !byId.has(x)))];
  if (authorIds.length) {
    const { data: authors } = await supabase.from("users").select("id, full_name, email, phone, role, status").in("id", authorIds);
    for (const a of authors ?? []) byId.set(a.id, a);
  }

  const appt = apptRes.data;
  let appointment: ComplaintDetail["appointment"] = null;
  let payment: ComplaintDetail["payment"] = null;
  if (appt) {
    const [{ data: doctor }, { data: patient }, { data: pay }] = await Promise.all([
      supabase.from("doctor_profiles").select("display_name").eq("user_id", appt.doctor_id).maybeSingle(),
      supabase.from("users").select("full_name, email").eq("id", appt.patient_id).maybeSingle(),
      supabase.from("payments").select("id, amount").eq("appointment_id", appt.id).eq("status", "paid").maybeSingle(),
    ]);
    appointment = {
      id: appt.id,
      slot_start: appt.slot_start,
      consultation_type: appt.consultation_type,
      status: appt.status,
      fee: appt.fee,
      payment_status: appt.payment_status,
      doctor_name: doctor?.display_name ?? null,
      patient_name: patient ? patient.full_name || patient.email : null,
    };
    if (pay) {
      // Only admins can read refunds/payments; for others this stays null.
      const { data: refunds } = await supabase
        .from("refunds")
        .select("amount, status")
        .eq("payment_id", pay.id)
        .in("status", ["pending", "processing", "succeeded"]);
      const refunded = (refunds ?? []).reduce((s, r) => s + Number(r.amount), 0);
      payment = { amount: Number(pay.amount), refunded, refundable: Math.max(0, Number(pay.amount) - refunded) };
    }
  }

  const name = (uid: string | null) => {
    const u = uid ? byId.get(uid) : null;
    return u ? u.full_name || u.email : null;
  };
  const complainant = byId.get(c.complainant_id) ?? null;
  const against = c.against_user_id ? (byId.get(c.against_user_id) ?? null) : null;
  return {
    ...c,
    messages: (messages ?? []).map((m) => ({ ...m, author_name: name(m.author_id) })),
    complainant,
    against: against ? { id: against.id, full_name: against.full_name, email: against.email, role: against.role } : null,
    appointment,
    payment,
  };
}

/** Appointments a user can attach to a new complaint (last 120 days + upcoming). */
export async function listComplaintAppointments(userId: string, role: "patient" | "doctor") {
  const supabase = await createClient();
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("appointments")
    .select("id, slot_start, consultation_type, status, doctor_id, patient_id")
    .eq(role === "patient" ? "patient_id" : "doctor_id", userId)
    .gte("slot_start", since)
    .order("slot_start", { ascending: false })
    .limit(50);
  const rows = data ?? [];
  const otherIds = [...new Set(rows.map((r) => (role === "patient" ? r.doctor_id : r.patient_id)))];
  const names = new Map<string, string>();
  if (otherIds.length) {
    if (role === "patient") {
      const { data: docs } = await supabase.from("doctor_profiles").select("user_id, display_name").in("user_id", otherIds);
      for (const d of docs ?? []) names.set(d.user_id, d.display_name);
    } else {
      const { data: users } = await supabase.from("users").select("id, full_name, email").in("id", otherIds);
      for (const u of users ?? []) names.set(u.id, u.full_name || u.email || "Patient");
    }
  }
  return rows.map((r) => ({
    id: r.id,
    slot_start: r.slot_start,
    consultation_type: r.consultation_type,
    status: r.status,
    other: names.get(role === "patient" ? r.doctor_id : r.patient_id) ?? (role === "patient" ? "Doctor" : "Patient"),
  }));
}
