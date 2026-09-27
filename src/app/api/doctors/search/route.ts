import { NextResponse, type NextRequest } from "next/server";
import { PAGE_SIZE, parseFilters } from "@/lib/search/params";
import { searchDoctors } from "@/lib/search/queries";

/**
 * GET /api/doctors/search?q=&specialty=&type=&minFee=&maxFee=&language=&city=&available=&sort=&page=
 * JSON used by the live doctor search. Only public (verified + active)
 * doctors are ever returned — the query runs as an anonymous visitor.
 */
export async function GET(request: NextRequest) {
  const filters = parseFilters(Object.fromEntries(request.nextUrl.searchParams));
  const { doctors, total } = await searchDoctors(filters);

  return NextResponse.json(
    { doctors, total, page: filters.page, pageSize: PAGE_SIZE, filters },
    {
      headers: {
        // Short shared cache: results include "next available" times.
        "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
