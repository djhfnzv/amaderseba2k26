import type { Metadata } from "next";
import { DoctorSearch } from "@/components/search/doctor-search";
import { requireRole } from "@/lib/auth/guards";
import { parseFilters } from "@/lib/search/params";
import { getFacets, searchDoctors } from "@/lib/search/queries";

export const metadata: Metadata = { title: "Find a doctor · MedLife" };

export default async function PatientFindDoctorPage({ searchParams }: PageProps<"/patient/doctors">) {
  await requireRole("patient", "/patient/doctors");
  const filters = parseFilters(await searchParams);
  const [results, facets] = await Promise.all([searchDoctors(filters), getFacets()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Find a doctor</h1>
        <p className="mt-1 text-slate-600">Every doctor is license-verified. Results update as you search.</p>
      </div>
      <DoctorSearch
        initialFilters={filters}
        initialResults={results}
        facets={facets}
        basePath="/patient/doctors"
        profileBase="/patient/doctors"
      />
    </div>
  );
}
