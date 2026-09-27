import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmergencyNotice, SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { DoctorSearch } from "@/components/search/doctor-search";
import { getCurrentUser } from "@/lib/auth/guards";
import { parseFilters, searchUrl } from "@/lib/search/params";
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
    !filters.language && !filters.available && filters.page === 1 && filters.sort === "relevance";

  return {
    title,
    description: `Browse verified ${specialty ? `${specialty.toLowerCase()} ` : ""}doctors${where} on ${site.name}. Compare experience, fees and consultation types, then book online or in person.`,
    alternates: { canonical: searchUrl({ specialty: filters.specialty, city: filters.city }) },
    robots: indexable ? undefined : { index: false, follow: true },
  };
}

export default async function DoctorsPage({ searchParams }: PageProps<"/doctors">) {
  const filters = parseFilters(await searchParams);

  // Signed-in patients search inside their dashboard instead.
  const user = await getCurrentUser();
  if (user?.role === "patient") redirect(searchUrl(filters, "/patient/doctors"));

  const [results, facets] = await Promise.all([searchDoctors(filters), getFacets()]);
  const specialty = facets.specialties.find((s) => s.slug === filters.specialty);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-slate-50">
        <div className="border-b border-slate-200 bg-white">
          <div className="page-container py-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {specialty ? `${specialty.name} doctors` : "Find a doctor"}
              {filters.city && <span className="text-slate-500"> in {filters.city}</span>}
            </h1>
            <p className="mt-1 text-slate-600">Every doctor on {site.name} is license-verified.</p>
          </div>
        </div>
        <div className="page-container py-8">
          <DoctorSearch
            initialFilters={filters}
            initialResults={results}
            facets={facets}
            basePath="/doctors"
            profileBase="/doctors"
          />
        </div>
      </main>
      <EmergencyNotice />
      <SiteFooter />
    </>
  );
}
