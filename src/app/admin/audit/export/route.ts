import { NextResponse, type NextRequest } from "next/server";
import { actionLabel } from "@/lib/audit/constants";
import { audit } from "@/lib/audit/log";
import { AUDIT_EXPORT_LIMIT, listAuditLogs, parseAuditFilters } from "@/lib/audit/queries";
import { getCurrentUser } from "@/lib/auth/guards";

/** Quote a CSV cell; neutralise spreadsheet formulas (=, +, -, @). */
function cell(v: unknown): string {
  let s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** GET /admin/audit/export?<same filters as the page> -> CSV (max 10,000 rows). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || user.status !== "active") return new NextResponse("Not found", { status: 404 });

  const filters = parseAuditFilters(Object.fromEntries(request.nextUrl.searchParams));
  const { rows, total, patients } = await listAuditLogs(filters, { limit: AUDIT_EXPORT_LIMIT, offset: 0 });

  const header = ["time_utc", "category", "action", "description", "success", "actor_id", "actor", "actor_role",
    "patient_id", "patient", "target_type", "target_id", "ip", "user_agent", "details"];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.occurred_at, r.category, r.action, actionLabel(r.action), r.success ? "yes" : "no", r.actor_id, r.actor_label, r.actor_role,
        r.patient_id, r.patient_id ? patients[r.patient_id] : "", r.target_type, r.target_id, r.ip, r.user_agent, r.metadata]
        .map(cell)
        .join(","),
    );
  }

  const applied = Object.fromEntries(Object.entries(filters).filter(([k, v]) => k !== "page" && v !== ""));
  await audit({
    category: "admin",
    action: "audit.export",
    targetType: "audit_logs",
    metadata: { rows: rows.length, total, filters: applied },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="medlife-audit-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
