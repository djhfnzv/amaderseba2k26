import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { AvailableSlot, DoctorAvailability, DoctorLeave } from "@/types/database";

export async function listOwnAvailability(doctorId: string): Promise<DoctorAvailability[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctor_availability")
    .select("*")
    .eq("doctor_id", doctorId)
    .order("weekday")
    .order("start_time");
  if (error) console.error("[listOwnAvailability]", error.message);
  return data ?? [];
}

/** Leaves that haven't ended yet, soonest first. */
export async function listUpcomingLeaves(doctorId: string, todayLocal: string): Promise<DoctorLeave[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctor_leaves")
    .select("*")
    .eq("doctor_id", doctorId)
    .gte("end_date", todayLocal)
    .order("start_date");
  if (error) console.error("[listUpcomingLeaves]", error.message);
  return data ?? [];
}

/**
 * Bookable slots. `asViewer` uses the signed-in session (lets a doctor preview
 * their own schedule before verification); otherwise runs as a public visitor.
 */
export async function getAvailableSlots(
  doctorId: string,
  opts: { from?: string; days?: number; asViewer?: boolean } = {},
): Promise<AvailableSlot[]> {
  const supabase = opts.asViewer ? await createClient() : createPublicClient();
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_doctor: doctorId,
    p_from: opts.from ?? null,
    p_days: opts.days ?? 7,
    p_type: null,
  });
  if (error) console.error("[getAvailableSlots]", `${error.code}: ${error.message}`);
  return data ?? [];
}

/** Today's date (YYYY-MM-DD) in a given IANA time zone. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}
