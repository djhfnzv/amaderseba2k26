import type { Metadata } from "next";
import Link from "next/link";
import { EmergencyNotice, SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { DoctorCard } from "@/components/search/doctor-card";
import { Pagination } from "@/components/search/pagination";
import { SearchBar } from "@/components/search/search-bar";
import { SearchFiltersForm } from "@/components/search/search-filters";
import { hasActiveFilters, parseFilters, PAGE_SIZE, searchUrl } from "@/lib/search/params";
import { getFacets, searchDoctors } from "@/lib/search/queries";
import { site } from "@/lib/site";

export async function generateMetadata({ searchParams }: PageProps<"/doctors">): Promise<Metadata> {
  const filters = parseFilters(await searchParams);
  const facets = await getFacets();
  const specialty = facets.specialties.find((s) => s.slug === filters.specialty)?.name;
  const where = filters.city ? ` in ${filters.city}` : "";
  const title = specialty
    ? `${specialty} doctors${where} — book online or in person · ${site.name}`
    : `Find verified doctors${where} · ${site.name}`;

  // Index the main listing and single-specialty pages; not arbitrary filter combos.
  const indexable = !filters.q && !filters.type && filters.minFee == null && filters.maxFee == null &&
    !filters.language && filters.page === 1 && filters.sort === "relevance";

  return {
    title,
    description: `Browse verified ${specialty ? `${specialty.toLowerCase()} ` : ""}doctors${where} on ${site.name}. Compare experience, fees and consultation types, then book online or in person.`,
    alternates: { canonical: searchUrl({ specialty: filters.specialty, city: filters.city }) },
    robots: indexable ? undefined : { index: false, follow: true },
  };
}

export default async function DoctorsPage({ searchParams }: PageProps<"/doctors">) {
  const filters = parseFilters(await searchParams);
  const [{ doctors, total }, facets] = await Promise.all([searchDoctors(filters), getFacets()]);
  const specialty = facets.specialties.find((s) => s.slug === filters.specialty);
  const from = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(filters.page * PAGE_SIZE, total);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-slate-50">
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {specialty ? `${specialty.name} doctors` : "Find a doctor"}
              {filters.city && <span className="text-slate-500"> in {filters.city}</span>}
            </h1>
            <p className="mt-1 text-slate-600">Every doctor on {site.name} is license-verified.</p>
            <div className="mt-5 max-w-2xl">
              <SearchBar
                defaultValue={filters.q}
                keep={{ specialty: filters.specialty, type: filters.type, city: filters.city, language: filters.language }}
              />
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <SearchFiltersForm filters={filters} facets={facets} />
          </aside>

          <section className="flex flex-col gap-5 lg:col-span-3" aria-label="Search results">
            <p className="text-sm text-slate-600" aria-live="polite">
              {total === 0
                ? "No doctors found"
                : `Showing ${from}–${to} of ${total} doctor${total === 1 ? "" : "s"}`}
              {filters.q && (
                <>
                  {" "}for “<span className="font-medium text-slate-900">{filters.q}</span>”
                </>
              )}
            </p>

            {doctors.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {doctors.map((d) => (
                  <li key={d.user_id}>
                    <DoctorCard doctor={d} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState filtered={hasActiveFilters(filters)} />
            )}

            <Pagination filters={filters} total={total} />
          </section>
        </div>
      </main>
      <EmergencyNotice />
      <SiteFooter />
    </>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-lg font-semibold text-slate-900">No doctors match your search</p>
      <p className="mt-1 text-sm text-slate-600">
        {filtered
          ? "Try removing a filter or searching for a specialty instead of a name."
          : "Doctors will appear here once they are verified."}
      </p>
      {filtered && (
        <Link
          href="/doctors"
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
        >
          See all doctors
        </Link>
      )}
    </div>
  );
}
