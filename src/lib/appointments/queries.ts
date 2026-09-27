import "server-only";
import { createClient } from "@/lib/supabase/server";
import { zonedStartOfDay } from "@/lib/time";
import type {
  Appointment,
  AppointmentEvent,
  AppUser,
  DoctorChamber,
  MedicalFile,
  PatientProfile,
  SlotHold,
} from "@/types/database";

export type DoctorSummary = {
  user_id: string;
  display_name: string;
  slug: string;
  photo_path: string | null;
  headline: string | null;
  timezone: string;
};

export type WithDoctor = Appointment & {
  doctor: DoctorSummary | null;
  chamber: Pick<DoctorChamber, "id" | "name" | "address" | "city" | "phone"> | null;
};

export type WithPatient = Appointment & {
  patient: Pick<AppUser, "id" | "full_name" | "email" | "phone"> | null;
  chamber: Pick<DoctorChamber, "id" | "name" | "address" | "city" | "phone"> | null;
};

async function attachDoctors(rows: Appointment[]): Promise<WithDoctor[]> {
  if (!rows.length) return [];
  const supabase = await createClient();
  const doctorIds = [...new Set(rows.map((r) => r.doctor_id))];
  const chamberIds = [...new Set(rows.map((r) => r.chamber_id).filter((id): id is string => !!id))];
  const [doctors, chambers] = await Promise.all([
    supabase.from("doctor_profiles").select("user_id, display_name, slug, photo_path, headline, timezone").in("user_id", doctorIds),
    chamberIds.length
      ? supabase.from("doctor_chambers").select("id, name, address, city, phone").in("id", chamberIds)
      : Promise.resolve({ data: [] as WithDoctor["chamber"][] }),
  ]);
  const doctorBy = new Map((doctors.data ?? []).map((d) => [d.user_id, d]));
  const chamberBy = new Map((chambers.data ?? []).filter(Boolean).map((c) => [c!.id, c!]));
  return rows.map((r) => ({
    ...r,
    doctor: doctorBy.get(r.doctor_id) ?? null,
    chamber: r.chamber_id ? (chamberBy.get(r.chamber_id) ?? null) : null,
  }));
}

async function attachPatients(rows: Appointment[]): Promise<WithPatient[]> {
  if (!rows.length) return [];
  const supabase = await createClient();
  const patientIds = [...new Set(rows.map((r) => r.patient_id))];
  const chamberIds = [...new Set(rows.map((r) => r.chamber_id).filter((id): id is string => !!id))];
  const [patients, chambers] = await Promise.all([
    supabase.from("users").select("id, full_name, email, phone").in("id", patientIds),
    chamberIds.length
      ? supabase.from("doctor_chambers").select("id, name, address, city, phone").in("id", chamberIds)
      : Promise.resolve({ data: [] as WithPatient["chamber"][] }),
  ]);
  const patientBy = new Map((patients.data ?? []).map((p) => [p.id, p]));
  const chamberBy = new Map((chambers.data ?? []).filter(Boolean).map((c) => [c!.id, c!]));
  return rows.map((r) => ({
    ...r,
    patient: patientBy.get(r.patient_id) ?? null,
    chamber: r.chamber_id ? (chamberBy.get(r.chamber_id) ?? null) : null,
  }));
}

// -----------------------------------------------------------------------------
// Holds
// -----------------------------------------------------------------------------
export async function getOwnHold(
  holdId: string,
): Promise<
  (SlotHold & { doctor: DoctorSummary | null; chamber: WithDoctor["chamber"]; fee: number | null; expired: boolean }) | null
> {
  const supabase = await createClient();
  const { data: hold } = await supabase.from("slot_holds").select("*").eq("id", holdId).maybeSingle();
  if (!hold) return null;
  const [{ data: doctor }, { data: chamber }] = await Promise.all([
    supabase
      .from("doctor_profiles")
      .select("user_id, display_name, slug, photo_path, headline, timezone, fee_online, fee_in_person")
      .eq("user_id", hold.doctor_id)
      .maybeSingle(),
    hold.chamber_id
      ? supabase.from("doctor_chambers").select("id, name, address, city, phone").eq("id", hold.chamber_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const fee = doctor ? (hold.consultation_type === "online" ? doctor.fee_online : doctor.fee_in_person) : null;
  return { ...hold, doctor, chamber, fee, expired: new Date(hold.expires_at).getTime() <= Date.now() };
}

// -----------------------------------------------------------------------------
// Patient side
// -----------------------------------------------------------------------------
export async function listPatientAppointments(patientId: string, limit?: number) {
  const supabase = await createClient();
  let q = supabase.from("appointments").select("*").eq("patient_id", patientId).order("slot_start", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) console.error("[listPatientAppointments]", error.message);
  const rows = await attachDoctors(data ?? []);
  const now = Date.now();
  const upcoming = rows
    .filter((r) => new Date(r.slot_end).getTime() > now && ["pending_payment", "confirmed", "in_progress"].includes(r.status))
    .sort((a, b) => a.slot_start.localeCompare(b.slot_start));
  const past = rows.filter((r) => !upcoming.includes(r));
  return { upcoming, past };
}

export async function listEvents(appointmentId: string): Promise<AppointmentEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointment_events")
    .select("*")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** One appointment the caller may see (RLS), with doctor + chamber. */
export async function getAppointmentWithDoctor(id: string): Promise<WithDoctor | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("appointments").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return (await attachDoctors([data]))[0];
}

// -----------------------------------------------------------------------------
// Doctor side
// -----------------------------------------------------------------------------
export type DoctorView = "today" | "upcoming" | "past";

export async function listDoctorAppointments(doctorId: string, view: DoctorView, timeZone: string) {
  const supabase = await createClient();
  const startOfToday = zonedStartOfDay(timeZone, 0);
  const startOfTomorrow = zonedStartOfDay(timeZone, 1);

  let q = supabase.from("appointments").select("*").eq("doctor_id", doctorId);
  if (view === "today") {
    q = q.gte("slot_start", startOfToday).lt("slot_start", startOfTomorrow).neq("status", "expired").order("slot_start");
  } else if (view === "upcoming") {
    q = q.gte("slot_start", startOfTomorrow).in("status", ["pending_payment", "confirmed"]).order("slot_start").limit(200);
  } else {
    q = q.lt("slot_start", startOfToday).order("slot_start", { ascending: false }).limit(100);
  }
  const { data, error } = await q;
  if (error) console.error("[listDoctorAppointments]", error.message);
  return attachPatients(data ?? []);
}

export async function countTodayQueue(doctorId: string, timeZone: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("doctor_id", doctorId)
    .gte("slot_start", zonedStartOfDay(timeZone, 0))
    .lt("slot_start", zonedStartOfDay(timeZone, 1))
    .in("status", ["pending_payment", "confirmed", "in_progress"]);
  return count ?? 0;
}

export type DoctorAppointmentDetail = WithPatient & {
  profile: PatientProfile | null;
  files: MedicalFile[];
  events: AppointmentEvent[];
};

/** Appointment + the patient's health profile and reports (RLS: only own patients). */
export async function getDoctorAppointment(id: string): Promise<DoctorAppointmentDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("appointments").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const [withPatient] = await attachPatients([data]);
  const [profile, files, events] = await Promise.all([
    supabase.from("patient_profiles").select("*").eq("user_id", data.patient_id).maybeSingle(),
    supabase.from("medical_files").select("*").eq("patient_id", data.patient_id).order("created_at", { ascending: false }),
    listEvents(id),
  ]);
  return { ...withPatient, profile: profile.data ?? null, files: files.data ?? [], events };
}
