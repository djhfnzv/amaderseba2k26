import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { DoctorSearchRow } from "@/types/database";
import { PAGE_SIZE, type SearchFilters } from "./params";

/** Supabase errors print as {} in the Next.js overlay; spell out the useful fields. */
function describeError(e: { code?: string; message?: string; details?: string | null; hint?: string | null }) {
  return `${e.code ?? "?"}: ${e.message ?? "unknown error"}${e.details ? ` — ${e.details}` : ""}${e.hint ? ` (hint: ${e.hint})` : ""}`;
}

export type SearchResult = { doctors: DoctorSearchRow[]; total: number };

export type Facets = {
  languages: string[];
  cities: string[];
  specialties: { slug: string; name: string; count: number }[];
};

/** Searches public (verified + active) doctors only — always as an anonymous visitor. */
export async function searchDoctors(f: SearchFilters): Promise<SearchResult> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("search_doctors", {
    p_query: f.q || null,
    p_specialty: f.specialty || null,
    p_type: f.type || null,
    p_min_fee: f.minFee,
    p_max_fee: f.maxFee,
    p_language: f.language || null,
    p_city: f.city || null,
    p_sort: f.sort,
    p_limit: PAGE_SIZE,
    p_offset: (f.page - 1) * PAGE_SIZE,
    p_available_days: f.available,
  });
  if (error) {
    console.error("[searchDoctors]", describeError(error));
    return { doctors: [], total: 0 };
  }
  const doctors = data ?? [];
  return { doctors, total: Number(doctors[0]?.total_count ?? 0) };
}

export const getFacets = cache(async (): Promise<Facets> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("doctor_search_facets");
  if (error) console.error("[getFacets]", describeError(error));
  const row = data?.[0];
  return {
    languages: row?.languages ?? [],
    cities: row?.cities ?? [],
    specialties: row?.specialties ?? [],
  };
});
