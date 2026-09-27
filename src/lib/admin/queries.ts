import "server-only";
import { createClient } from "@/lib/supabase/server";
import { zonedStartOfDay } from "@/lib/time";
import type { AccountStatus, AdminAction, AppUser, Role } from "@/types/database";

/** Platform "today" for admin counts. */
export const PLATFORM_TIMEZONE = "Asia/Dhaka";
export const USERS_PAGE_SIZE = 25;

export type UserFilters = {
  q: string;
  role: Role | "";
  status: AccountStatus | "";
  page: number;
};

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseUserFilters(raw: Raw): UserFilters {
  const role = first(raw.role);
  const status = first(raw.status);
  const page = Number.parseInt(first(raw.page), 10);
  return {
    // Strip characters that have meaning in PostgREST filter syntax.
    q: first(raw.q).replace(/[,()*%\\:"]/g, " ").trim().slice(0, 80),
    role: role === "patient" || role === "doctor" || role === "admin" ? role : "",
    status: status === "active" || status === "suspended" ? status : "",
    page: Number.isFinite(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

export async function listUsers(f: UserFilters): Promise<{ users: AppUser[]; total: number }> {
  const supabase = await createClient();
  let q = supabase.from("users").select("*", { count: "exact" });
  if (f.q) q = q.or(`full_name.ilike.*${f.q}*,email.ilike.*${f.q}*,phone.ilike.*${f.q}*`);
  if (f.role) q = q.eq("role", f.role);
  if (f.status) q = q.eq("status", f.status);
  const from = (f.page - 1) * USERS_PAGE_SIZE;
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(from, from + USERS_PAGE_SIZE - 1);
  if (error) console.error("[listUsers]", error.message);
  return { users: data ?? [], total: count ?? 0 };
}

export async function getUser(id: string): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function listAdminActions(targetId: string): Promise<(AdminAction & { adminName: string | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("admin_actions")
    .select("*")
    .eq("target_user_id", targetId)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.admin_id).filter((x): x is string => !!x))];
  const { data: admins } = ids.length
    ? await supabase.from("users").select("id, full_name, email").in("id", ids)
    : { data: [] };
  const nameBy = new Map((admins ?? []).map((a) => [a.id, a.full_name || a.email]));
  return rows.map((r) => ({ ...r, adminName: r.admin_id ? (nameBy.get(r.admin_id) ?? null) : null }));
}

/** Appointment counts for one user, as patient and as doctor. */
export async function userAppointmentStats(userId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const count = (col: "patient_id" | "doctor_id", upcoming: boolean) => {
    let q = supabase.from("appointments").select("id", { count: "exact", head: true }).eq(col, userId);
    q = upcoming ? q.gt("slot_start", now).in("status", ["pending_payment", "confirmed"]) : q;
    return q.then((r) => r.count ?? 0);
  };
  const [asPatient, asPatientUpcoming, asDoctor, asDoctorUpcoming] = await Promise.all([
    count("patient_id", false),
    count("patient_id", true),
    count("doctor_id", false),
    count("doctor_id", true),
  ]);
  return { asPatient, asPatientUpcoming, asDoctor, asDoctorUpcoming };
}

/** Headline numbers for the admin dashboard (admin RLS reads everything). */
export async function getDashboardStats() {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const todayStart = zonedStartOfDay(PLATFORM_TIMEZONE, 0);
  const tomorrowStart = zonedStartOfDay(PLATFORM_TIMEZONE, 1);

  const [patients, doctors, verified, pending, suspended, today, upcoming] = await Promise.all([
    supabase.from("users").select("id", head).eq("role", "patient"),
    supabase.from("users").select("id", head).eq("role", "doctor"),
    supabase.from("doctor_profiles").select("user_id", head).eq("is_verified", true),
    supabase.from("verification_requests").select("id", head).eq("status", "pending"),
    supabase.from("users").select("id", head).eq("status", "suspended"),
    supabase
      .from("appointments")
      .select("id", head)
      .gte("slot_start", todayStart)
      .lt("slot_start", tomorrowStart)
      .in("status", ["pending_payment", "confirmed", "in_progress", "completed"]),
    supabase
      .from("appointments")
      .select("id", head)
      .gte("slot_start", tomorrowStart)
      .in("status", ["pending_payment", "confirmed"]),
  ]);

  return {
    patients: patients.count ?? 0,
    doctors: doctors.count ?? 0,
    verifiedDoctors: verified.count ?? 0,
    pendingVerifications: pending.count ?? 0,
    suspended: suspended.count ?? 0,
    appointmentsToday: today.count ?? 0,
    appointmentsUpcoming: upcoming.count ?? 0,
  };
}
