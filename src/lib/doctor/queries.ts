import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/validation/doctor";
import type {
  AppUser,
  DoctorAward,
  DoctorChamber,
  DoctorEducation,
  DoctorExperience,
  DoctorProfile,
  DoctorPublication,
  Specialty,
} from "@/types/database";

export type PortfolioDetails = {
  specialties: Specialty[];
  education: DoctorEducation[];
  experience: DoctorExperience[];
  chambers: DoctorChamber[];
  publications: DoctorPublication[];
  awards: DoctorAward[];
};

export type Portfolio = { profile: DoctorProfile } & PortfolioDetails;

export const listSpecialties = cache(async (): Promise<Specialty[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("specialties")
    .select("*")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
});

/**
 * The signed-in doctor's profile, created on first use with a unique
 * slug derived from their name (e.g. dr-nadia-rahman, dr-nadia-rahman-4821).
 */
export async function getOrCreateOwnProfile(user: AppUser): Promise<DoctorProfile> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("doctor_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return existing;

  const name = user.full_name.trim() || "Doctor";
  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data, error } = await supabase
      .from("doctor_profiles")
      .insert({ user_id: user.id, slug, display_name: name.slice(0, 120) })
      .select("*")
      .single();
    if (data) return data;
    if (error?.code !== "23505") throw new Error(`Could not create doctor profile: ${error?.message}`);
    // 23505 = slug taken (or a concurrent request already created the row).
    const { data: raced } = await supabase
      .from("doctor_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (raced) return raced;
  }
  throw new Error("Could not generate a unique profile address");
}

/** Everything under a doctor's portfolio. RLS decides what the caller may see. */
export async function getPortfolioDetails(doctorId: string): Promise<PortfolioDetails> {
  const supabase = await createClient();
  const [spec, edu, exp, ch, pub, aw] = await Promise.all([
    supabase.from("doctor_specialties").select("specialty_id, is_primary").eq("doctor_id", doctorId),
    supabase.from("doctor_education").select("*").eq("doctor_id", doctorId).order("year", { ascending: false, nullsFirst: false }),
    supabase.from("doctor_experience").select("*").eq("doctor_id", doctorId).order("start_year", { ascending: false }),
    supabase.from("doctor_chambers").select("*").eq("doctor_id", doctorId).order("created_at"),
    supabase.from("doctor_publications").select("*").eq("doctor_id", doctorId).order("year", { ascending: false, nullsFirst: false }),
    supabase.from("doctor_awards").select("*").eq("doctor_id", doctorId).order("year", { ascending: false, nullsFirst: false }),
  ]);

  // Surface failures instead of silently rendering empty sections.
  for (const [name, res] of Object.entries({ spec, edu, exp, ch, pub, aw })) {
    if (res.error) console.error(`[getPortfolioDetails ${name}]`, res.error);
  }

  const ids = new Set((spec.data ?? []).map((s) => s.specialty_id));
  const all = await listSpecialties();

  return {
    specialties: all.filter((s) => ids.has(s.id)),
    education: edu.data ?? [],
    experience: exp.data ?? [],
    chambers: ch.data ?? [],
    publications: pub.data ?? [],
    awards: aw.data ?? [],
  };
}

/**
 * Portfolio by public slug. Returns null when the caller may not see it:
 * RLS only exposes verified+active doctors, or the doctor's own profile.
 * Cached so generateMetadata and the page share one fetch.
 */
export const getPortfolioBySlug = cache(async (slug: string): Promise<Portfolio | null> => {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("doctor_profiles")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!profile) return null;
  return { profile, ...(await getPortfolioDetails(profile.user_id)) };
});

export type ChecklistItem = { label: string; done: boolean };

/** What the doctor still needs to fill in for a complete portfolio. */
export function portfolioChecklist(p: Portfolio): ChecklistItem[] {
  const { profile } = p;
  return [
    { label: "Photo", done: !!profile.photo_path },
    { label: "Headline & bio", done: !!profile.headline && !!profile.bio },
    { label: "License number", done: !!profile.license_number },
    { label: "Specialties", done: p.specialties.length > 0 },
    { label: "Consultation type & fee", done: profile.offers_online || profile.offers_in_person },
    { label: "Education", done: p.education.length > 0 },
    { label: "Experience", done: p.experience.length > 0 },
    { label: "Chamber", done: p.chambers.length > 0 || !profile.offers_in_person },
  ];
}
