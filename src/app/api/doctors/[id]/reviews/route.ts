import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_REVIEWS_PAGE, REVIEW_SORTS, type ReviewSort } from "@/lib/reviews/constants";
import { listPublicReviews } from "@/lib/reviews/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/doctors/:id/reviews?sort=newest|highest|lowest&offset=0
 * Published reviews of a public doctor (no patient identity).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/doctors/[id]/reviews">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid doctor" }, { status: 400 });
  const sp = request.nextUrl.searchParams;
  const sortParam = sp.get("sort");
  const sort: ReviewSort = REVIEW_SORTS.some((s) => s.value === sortParam) ? (sortParam as ReviewSort) : "newest";
  const offset = Math.min(Math.max(Number(sp.get("offset")) || 0, 0), 5000);

  const page = await listPublicReviews(id, { sort, offset, limit: PUBLIC_REVIEWS_PAGE });
  return NextResponse.json(page, { headers: { "Cache-Control": "public, max-age=30" } });
}
