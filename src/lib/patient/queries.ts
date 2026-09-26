import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MedicalFile, PatientProfile } from "@/types/database";

/** The signed-in patient's health profile, or null if not filled in yet. */
export async function getHealthProfile(userId: string): Promise<PatientProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("patient_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/** The signed-in patient's medical files, newest first (RLS scopes to own files). */
export async function listMedicalFiles(limit?: number): Promise<MedicalFile[]> {
  const supabase = await createClient();
  let query = supabase
    .from("medical_files")
    .select("*")
    .order("created_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data } = await query;
  return data ?? [];
}

const PROFILE_FIELDS: { label: string; filled: (p: PatientProfile) => boolean }[] = [
  { label: "Date of birth", filled: (p) => !!p.date_of_birth },
  { label: "Sex", filled: (p) => !!p.sex },
  { label: "Weight", filled: (p) => p.weight_kg != null },
  { label: "Height", filled: (p) => p.height_cm != null },
  { label: "Blood group", filled: (p) => !!p.blood_group },
  { label: "Emergency contact", filled: (p) => !!p.emergency_contact_phone },
];

/** Percentage of the core profile fields that are filled in. */
export function profileCompleteness(profile: PatientProfile | null): {
  percent: number;
  missing: string[];
} {
  if (!profile) return { percent: 0, missing: PROFILE_FIELDS.map((f) => f.label) };
  const missing = PROFILE_FIELDS.filter((f) => !f.filled(profile)).map((f) => f.label);
  const percent = Math.round(((PROFILE_FIELDS.length - missing.length) / PROFILE_FIELDS.length) * 100);
  return { percent, missing };
}
