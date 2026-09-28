"use client";

import { useRef, useState } from "react";
import { DoctorCard } from "./doctor-card";
import type { Facets } from "@/lib/search/queries";
import {
  AVAILABILITY_OPTIONS,
  PAGE_SIZE,
  RATING_OPTIONS,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  searchQuery,
  searchUrl,
  type SearchFilters,
} from "@/lib/search/params";
import type { DoctorSearchRow } from "@/types/database";

type Results = { doctors: DoctorSearchRow[]; total: number };

const DEBOUNCE_MS = 350;
const field =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600";

/**
 * Live doctor search: filters update results via /api/doctors/search (JSON)
 * without reloading the page, and the URL stays shareable. Without
 * JavaScript it still works as a plain GET form.
 */
export function DoctorSearch({
  initialFilters,
  initialResults,
  facets,
  basePath,
  profileBase,
}: {
  initialFilters: SearchFilters;
  initialResults: Results;
  facets: Facets;
  /** Page the search lives on, e.g. "/doctors" or "/patient/doctors". */
  basePath: string;
  /** Where doctor cards link to. */
  profileBase: string;
}) {
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [results, setResults] = useState<Results>(initialResults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function load(next: SearchFilters) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    window.history.replaceState(null, "", searchUrl(next, basePath));
    try {
      const res = await fetch(`/api/doctors/search?${searchQuery(next)}`, { signal: controller.signal });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as Results;
      setResults({ doctors: json.doctors, total: json.total });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Couldn't load doctors. Check your connection and try again.");
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  /** Apply a change; typing fields wait briefly so we don't query on every key. */
  function update(patch: Partial<SearchFilters>, debounce = false) {
    const next = { ...filters, ...patch, page: patch.page ?? 1 };
    setFilters(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (debounce) timerRef.current = setTimeout(() => load(next), DEBOUNCE_MS);
    else void load(next);
  }

  function goToPage(page: number) {
    update({ page });
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const fee = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Math.max(0, Math.floor(Number(v))));
  const activeCount = [filters.specialty, filters.type, filters.minFee != null || filters.maxFee != null, filters.language, filters.city, filters.available, filters.minRating].filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(results.total / PAGE_SIZE));
  const from = results.total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(filters.page * PAGE_SIZE, results.total);

  return (
    <form
      action={basePath}
      method="get"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (timerRef.current) clearTimeout(timerRef.current);
        void load({ ...filters, page: 1 });
      }}
      className="@container flex flex-col gap-6"
    >
      {/* Text search */}
      <div className="flex gap-2">
        <label htmlFor="doctor-q" className="sr-only">Search doctors by name or specialty</label>
        <div className="relative flex-1">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.2-4.2" />
          </svg>
          <input
            id="doctor-q"
            name="q"
            type="search"
            value={filters.q}
            maxLength={100}
            onChange={(e) => update({ q: e.target.value }, true)}
            placeholder="Doctor name or specialty, e.g. Cardiology"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <button type="submit" className="h-12 shrink-0 rounded-xl bg-teal-700 px-5 font-semibold text-white hover:bg-teal-800">
          Search
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[15.5rem_minmax(0,1fr)] @5xl:gap-8">
        {/* Filters */}
        <aside className="min-w-0 @3xl:sticky @3xl:top-6 @3xl:self-start">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls="doctor-filters"
            className="flex h-11 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 @3xl:hidden"
          >
            <span>Filters{activeCount > 0 && <span className="ml-1 text-teal-700">({activeCount})</span>}</span>
            <span aria-hidden="true">{filtersOpen ? "−" : "+"}</span>
          </button>

          <div id="doctor-filters" className={`${filtersOpen ? "mt-3 flex animate-fade-down" : "hidden"} flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 @3xl:mt-0 @3xl:flex`}>
            <Select label="Specialty" name="specialty" value={filters.specialty} onChange={(v) => update({ specialty: v })} placeholder="All specialties"
              options={facets.specialties.map((s) => ({ value: s.slug, label: `${s.name} (${s.count})` }))} />
            <Select label="Consultation type" name="type" value={filters.type} onChange={(v) => update({ type: v as SearchFilters["type"] })} placeholder="Any"
              options={TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))} />
            <Select label="Available" name="available" value={filters.available ? String(filters.available) : ""} onChange={(v) => update({ available: v ? Number(v) : null })} placeholder="Any time"
              options={AVAILABILITY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} />
            <Select label="Rating" name="minRating" value={filters.minRating ? String(filters.minRating) : ""} onChange={(v) => update({ minRating: v ? Number(v) : null })} placeholder="Any rating"
              options={RATING_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} />

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-slate-800">Fee (৳)</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="sr-only" htmlFor="f-minFee">Minimum fee</label>
                <input id="f-minFee" name="minFee" type="number" inputMode="numeric" min={0} placeholder="Min"
                  value={filters.minFee ?? ""} onChange={(e) => update({ minFee: fee(e.target.value) }, true)} className={field} />
                <label className="sr-only" htmlFor="f-maxFee">Maximum fee</label>
                <input id="f-maxFee" name="maxFee" type="number" inputMode="numeric" min={0} placeholder="Max"
                  value={filters.maxFee ?? ""} onChange={(e) => update({ maxFee: fee(e.target.value) }, true)} className={field} />
              </div>
            </fieldset>

            {facets.languages.length > 0 && (
              <Select label="Language" name="language" value={filters.language} onChange={(v) => update({ language: v })} placeholder="Any language"
                options={facets.languages.map((l) => ({ value: l, label: l }))} />
            )}
            {facets.cities.length > 0 && (
              <Select label="City (chamber)" name="city" value={filters.city} onChange={(v) => update({ city: v })} placeholder="Any city"
                options={facets.cities.map((c) => ({ value: c, label: c }))} />
            )}
            <Select label="Sort by" name="sort" value={filters.sort} onChange={(v) => update({ sort: v as SearchFilters["sort"] })} placeholder={null}
              options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />

            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => update({ specialty: "", type: "", minFee: null, maxFee: null, language: "", city: "", available: null, minRating: null })}
                className="text-sm font-medium text-teal-700 hover:underline"
              >
                Clear filters
              </button>
            )}
            {/* Only needed without JavaScript; with JS every change applies instantly. */}
            <noscript>
              <button type="submit" className="h-10 w-full rounded-lg bg-teal-700 text-sm font-semibold text-white">Apply filters</button>
            </noscript>
          </div>
        </aside>

        {/* Results */}
        <section ref={resultsRef} aria-label="Search results" aria-busy={loading} className="flex min-w-0 scroll-mt-24 flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600" aria-live="polite">
              {results.total === 0 ? "No doctors found" : `Showing ${from}–${to} of ${results.total} doctor${results.total === 1 ? "" : "s"}`}
              {filters.q.trim() && (
                <> for “<span className="font-medium text-slate-900">{filters.q.trim()}</span>”</>
              )}
            </p>
            {loading && (
              <span className="flex items-center gap-2 text-sm text-slate-500">
                <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700" aria-hidden="true" />
                Updating…
              </span>
            )}
          </div>

          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

          {results.doctors.length > 0 ? (
            <ul className={`grid-auto-fill gap-4 transition-opacity [--card-min:16rem] ${loading ? "opacity-60" : ""}`}>
              {results.doctors.map((d, i) => (
                <li key={d.user_id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <DoctorCard doctor={d} profileBase={profileBase} />
                </li>
              ))}
            </ul>
          ) : (
            !loading && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <p className="text-lg font-semibold text-slate-900">No doctors match your search</p>
                <p className="mt-1 text-sm text-slate-600">Try removing a filter or searching for a specialty instead of a name.</p>
              </div>
            )
          )}

          {pages > 1 && (
            <nav aria-label="Search results pages" className="flex items-center justify-center gap-3 text-sm">
              <button type="button" disabled={filters.page <= 1 || loading} onClick={() => goToPage(filters.page - 1)}
                className="h-10 rounded-lg px-3 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
                ← Prev
              </button>
              <span className="text-slate-600">Page {filters.page} of {pages}</span>
              <button type="button" disabled={filters.page >= pages || loading} onClick={() => goToPage(filters.page + 1)}
                className="h-10 rounded-lg px-3 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
                Next →
              </button>
            </nav>
          )}
        </section>
      </div>
    </form>
  );
}

function Select({
  label,
  name,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string | null;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`f-${name}`} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <select id={`f-${name}`} name={name} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        {placeholder !== null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
