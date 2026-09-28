import type { DoctorSearchSort } from "@/types/database";

export const PAGE_SIZE = 12;

export const SORT_OPTIONS: { value: DoctorSearchSort; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "rating", label: "Top rated" },
  { value: "soonest", label: "Available soonest" },
  { value: "fee_asc", label: "Fee: low to high" },
  { value: "fee_desc", label: "Fee: high to low" },
  { value: "experience", label: "Most experienced" },
];

export const AVAILABILITY_OPTIONS = [
  { value: 1, label: "Today" },
  { value: 3, label: "Within 3 days" },
  { value: 7, label: "Within a week" },
] as const;

/** Ratings only count once a doctor has 3+ reviews. */
export const RATING_OPTIONS = [
  { value: 4.5, label: "4.5★ & up" },
  { value: 4, label: "4★ & up" },
  { value: 3, label: "3★ & up" },
] as const;

export const TYPE_OPTIONS = [
  { value: "online", label: "Online (video)" },
  { value: "in_person", label: "In-person" },
] as const;

export type SearchFilters = {
  q: string;
  specialty: string;
  type: "" | "online" | "in_person";
  minFee: number | null;
  maxFee: number | null;
  language: string;
  city: string;
  available: number | null;
  minRating: number | null;
  sort: DoctorSearchSort;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function fee(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.floor(n) : null;
}

/** Parses URL search params into safe, bounded filter values. */
export function parseFilters(raw: RawParams): SearchFilters {
  const type = first(raw.type);
  const sort = first(raw.sort) as DoctorSearchSort;
  const page = Number.parseInt(first(raw.page), 10);
  let minFee = fee(first(raw.minFee));
  let maxFee = fee(first(raw.maxFee));
  if (minFee != null && maxFee != null && minFee > maxFee) [minFee, maxFee] = [maxFee, minFee];

  return {
    q: first(raw.q).trim().slice(0, 100),
    specialty: /^[a-z0-9-]{1,60}$/.test(first(raw.specialty)) ? first(raw.specialty) : "",
    type: type === "online" || type === "in_person" ? type : "",
    minFee,
    maxFee,
    language: first(raw.language).trim().slice(0, 40),
    city: first(raw.city).trim().slice(0, 80),
    available: AVAILABILITY_OPTIONS.some((o) => String(o.value) === first(raw.available)) ? Number(first(raw.available)) : null,
    minRating: RATING_OPTIONS.some((o) => String(o.value) === first(raw.minRating)) ? Number(first(raw.minRating)) : null,
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? sort : "relevance",
    page: Number.isFinite(page) && page >= 1 && page <= 500 ? page : 1,
  };
}

/** Query string for filters, dropping defaults (no leading "?"). */
export function searchQuery(filters: Partial<SearchFilters>): string {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.specialty) p.set("specialty", filters.specialty);
  if (filters.type) p.set("type", filters.type);
  if (filters.minFee != null) p.set("minFee", String(filters.minFee));
  if (filters.maxFee != null) p.set("maxFee", String(filters.maxFee));
  if (filters.language) p.set("language", filters.language);
  if (filters.city) p.set("city", filters.city);
  if (filters.available) p.set("available", String(filters.available));
  if (filters.minRating) p.set("minRating", String(filters.minRating));
  if (filters.sort && filters.sort !== "relevance") p.set("sort", filters.sort);
  if (filters.page && filters.page > 1) p.set("page", String(filters.page));
  return p.toString();
}

/** Builds a search URL from filters, dropping defaults. */
export function searchUrl(filters: Partial<SearchFilters>, base = "/doctors"): string {
  const qs = searchQuery(filters);
  return qs ? `${base}?${qs}` : base;
}
