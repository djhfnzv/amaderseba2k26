import { NextResponse, type NextRequest } from "next/server";
import { getAnalytics, parseRange } from "@/lib/admin/analytics";
import { getCurrentUser } from "@/lib/auth/guards";

/** GET /api/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD (Bangladesh dates). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || user.status !== "active") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const { from, to } = parseRange(sp.get("from"), sp.get("to"));
  const data = await getAnalytics(from, to);
  if (!data) return NextResponse.json({ error: "Couldn't load analytics." }, { status: 500 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
