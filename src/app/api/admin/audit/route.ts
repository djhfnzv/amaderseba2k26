import { NextResponse, type NextRequest } from "next/server";
import { AUDIT_PAGE_SIZE, getUserLabel, listAuditLogs, parseAuditFilters } from "@/lib/audit/queries";
import { getCurrentUser } from "@/lib/auth/guards";

export type AuditFeed = Awaited<ReturnType<typeof listAuditLogs>> & {
  page: number;
  pages: number;
  actorName: string | null;
  patientName: string | null;
};

/**
 * JSON feed for the admin audit log (filters, paging and live updates).
 * GET /api/admin/audit?<filters>[&after=<id>]
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || user.status !== "active") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const filters = parseAuditFilters(Object.fromEntries(sp));
  const after = Number(sp.get("after"));
  const afterId = Number.isSafeInteger(after) && after > 0 ? after : undefined;

  const [result, actorName, patientName] = await Promise.all([
    listAuditLogs(filters, { afterId }),
    filters.actor && !afterId ? getUserLabel(filters.actor) : Promise.resolve(null),
    filters.patient && !afterId ? getUserLabel(filters.patient) : Promise.resolve(null),
  ]);

  const body: AuditFeed = {
    ...result,
    page: filters.page,
    pages: Math.max(1, Math.ceil(result.total / AUDIT_PAGE_SIZE)),
    actorName,
    patientName,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
