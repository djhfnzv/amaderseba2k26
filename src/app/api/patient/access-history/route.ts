import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_PAGE_SIZE } from "@/lib/audit/constants";
import { listMyRecordAccess } from "@/lib/audit/queries";
import { getCurrentUser } from "@/lib/auth/guards";

/**
 * JSON feed for a patient's "who opened my records" list.
 * GET /api/patient/access-history?page=1
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "patient" || user.status !== "active") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const page = Math.max(1, Math.min(500, Number(request.nextUrl.searchParams.get("page")) || 1));
  const { rows, total } = await listMyRecordAccess(page, ACCESS_PAGE_SIZE);
  return NextResponse.json(
    { rows, total, page, pages: Math.max(1, Math.ceil(total / ACCESS_PAGE_SIZE)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
