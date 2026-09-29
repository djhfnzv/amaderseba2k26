import "server-only";
import { ageFromDob } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type {
  AppUser,
  DoctorAdvice,
  PatientProfile,
  Prescription,
  PrescriptionItem,
  PrescriptionStatus,
  PrescriptionTemplate,
  PrescriptionTest,
} from "@/types/database";

export type PrescriptionDetail = Prescription & { items: PrescriptionItem[]; tests: PrescriptionTest[] };

export type PrescriptionListRow = Pick<
  Prescription,
  | "id" | "status" | "version" | "patient_id" | "patient_name" | "diagnosis" | "appointment_id"
  | "signed_at" | "created_at" | "updated_at" | "doctor_name" | "doctor_id" | "verify_code"
>;

const LIST_COLUMNS =
  "id, status, version, patient_id, patient_name, diagnosis, appointment_id, signed_at, created_at, updated_at, doctor_name, doctor_id, verify_code";

/** One prescription with its medicines and tests (visibility decided by RLS). */
export async function getPrescription(id: string): Promise<PrescriptionDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("prescriptions").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const [items, tests] = await Promise.all([
    supabase.from("prescription_items").select("*").eq("prescription_id", id).order("sort_order"),
    supabase.from("prescription_tests").select("*").eq("prescription_id", id).order("sort_order"),
  ]);
  return { ...data, items: items.data ?? [], tests: tests.data ?? [] };
}

export async function listDoctorPrescriptions(
  doctorId: string,
  opts: { status?: PrescriptionStatus; q?: string; limit?: number } = {},
): Promise<PrescriptionListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("prescriptions")
    .select(LIST_COLUMNS)
    .eq("doctor_id", doctorId)
    .order("updated_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) query = query.eq("status", opts.status);
  const q = opts.q?.replace(/[%_,()]/g, " ").trim();
  if (q) query = query.ilike("patient_name", `%${q}%`);
  const { data } = await query;
  return data ?? [];
}

/** Signed + replaced prescriptions a patient can see. */
export async function listPatientPrescriptions(patientId: string): Promise<PrescriptionListRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prescriptions")
    .select(LIST_COLUMNS)
    .eq("patient_id", patientId)
    .in("status", ["signed", "superseded"])
    .order("signed_at", { ascending: false });
  return data ?? [];
}

export async function listAllPrescriptions(opts: { q?: string; limit?: number } = {}): Promise<PrescriptionListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("prescriptions")
    .select(LIST_COLUMNS)
    .neq("status", "draft")
    .order("signed_at", { ascending: false })
    .limit(opts.limit ?? 100);
  const q = opts.q?.replace(/[%_,()]/g, " ").trim();
  if (q) query = /^[A-Z0-9]{10}$/i.test(q) ? query.eq("verify_code", q.toUpperCase()) : query.ilike("doctor_name", `%${q}%`);
  const { data } = await query;
  return data ?? [];
}

export async function listForAppointment(appointmentId: string): Promise<PrescriptionListRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prescriptions")
    .select(LIST_COLUMNS)
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Earlier/later versions of the same prescription chain. */
export async function listVersions(rx: Prescription): Promise<PrescriptionListRow[]> {
  const supabase = await createClient();
  const ids = new Set<string>([rx.id]);
  // Walk up to the first version.
  let parent = rx.parent_id;
  const chain: PrescriptionListRow[] = [rx];
  while (parent && !ids.has(parent)) {
    ids.add(parent);
    const { data } = await supabase.from("prescriptions").select(`${LIST_COLUMNS}, parent_id`).eq("id", parent).maybeSingle();
    if (!data) break;
    chain.push(data);
    parent = data.parent_id;
  }
  // And down to newer versions.
  let child: string | null = rx.id;
  while (child) {
    const { data }: { data: (PrescriptionListRow & { parent_id: string | null }) | null } = await supabase
      .from("prescriptions")
      .select(`${LIST_COLUMNS}, parent_id`)
      .eq("parent_id", child)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data || ids.has(data.id)) break;
    ids.add(data.id);
    chain.push(data);
    child = data.id;
  }
  return chain.sort((a, b) => b.version - a.version);
}

// -----------------------------------------------------------------------------
// Patients the doctor can prescribe for
// -----------------------------------------------------------------------------

export type DoctorPatient = Pick<AppUser, "id" | "full_name" | "email" | "phone"> & { last_visit: string };

export async function listDoctorPatients(doctorId: string): Promise<DoctorPatient[]> {
  const supabase = await createClient();
  const { data: appts } = await supabase
    .from("appointments")
    .select("patient_id, slot_start")
    .eq("doctor_id", doctorId)
    .in("status", ["pending_payment", "confirmed", "in_progress", "completed", "no_show"])
    .order("slot_start", { ascending: false })
    .limit(500);
  const last = new Map<string, string>();
  for (const a of appts ?? []) if (!last.has(a.patient_id)) last.set(a.patient_id, a.slot_start);
  if (!last.size) return [];
  const { data: users } = await supabase.from("users").select("id, full_name, email, phone").in("id", [...last.keys()]);
  return (users ?? [])
    .map((u) => ({ ...u, last_visit: last.get(u.id)! }))
    .sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""));
}

export type PatientSnapshot = {
  patient_name: string;
  patient_age: string | null;
  patient_sex: PatientProfile["sex"];
  patient_weight: string | null;
  patient_phone: string | null;
  allergies: string[];
  chronic_conditions: string[];
};

/** Name/age/sex/weight/phone as printed, plus allergies for the warning. */
export async function getPatientSnapshot(patientId: string): Promise<PatientSnapshot | null> {
  const supabase = await createClient();
  const [{ data: user }, { data: profile }] = await Promise.all([
    supabase.from("users").select("full_name, email, phone").eq("id", patientId).maybeSingle(),
    supabase.from("patient_profiles").select("*").eq("user_id", patientId).maybeSingle(),
  ]);
  if (!user) return null;
  const age = ageFromDob(profile?.date_of_birth ?? null);
  return {
    patient_name: user.full_name || user.email || "",
    patient_age: age != null ? `${age} y` : null,
    patient_sex: profile?.sex ?? null,
    patient_weight: profile?.weight_kg != null ? `${profile.weight_kg} kg` : null,
    patient_phone: user.phone ?? null,
    allergies: profile?.allergies ?? [],
    chronic_conditions: profile?.chronic_conditions ?? [],
  };
}

/** The doctor's most recent signed prescription for this patient. */
export async function getLastSigned(doctorId: string, patientId: string, excludeId?: string): Promise<PrescriptionDetail | null> {
  const supabase = await createClient();
  let query = supabase
    .from("prescriptions")
    .select("id")
    .eq("doctor_id", doctorId)
    .eq("patient_id", patientId)
    .eq("status", "signed")
    .order("signed_at", { ascending: false })
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  return data ? getPrescription(data.id) : null;
}

export async function listTemplates(doctorId: string): Promise<PrescriptionTemplate[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("prescription_templates").select("*").eq("doctor_id", doctorId).order("name");
  return data ?? [];
}

// -----------------------------------------------------------------------------
// Advice notes
// -----------------------------------------------------------------------------

export type AdviceWithNames = DoctorAdvice & { doctor_name: string | null };

export async function listAdvice(filter: { patientId?: string; appointmentId?: string; doctorId?: string }): Promise<AdviceWithNames[]> {
  const supabase = await createClient();
  let query = supabase.from("doctor_advice").select("*").order("created_at", { ascending: false }).limit(100);
  if (filter.patientId) query = query.eq("patient_id", filter.patientId);
  if (filter.appointmentId) query = query.eq("appointment_id", filter.appointmentId);
  if (filter.doctorId) query = query.eq("doctor_id", filter.doctorId);
  const { data } = await query;
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: doctors } = await supabase
    .from("doctor_profiles")
    .select("user_id, display_name")
    .in("user_id", [...new Set(rows.map((r) => r.doctor_id))]);
  const names = new Map((doctors ?? []).map((d) => [d.user_id, d.display_name]));
  return rows.map((r) => ({ ...r, doctor_name: names.get(r.doctor_id) ?? null }));
}

/** Active lab tests for the editor's quick picks (M13, admin-managed). */
export async function listQuickTests(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("lab_tests").select("name").eq("is_active", true).order("sort_order").order("name");
  return (data ?? []).map((t) => t.name);
}
