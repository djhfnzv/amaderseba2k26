import type { Metadata } from "next";
import type { AuditFeed } from "@/app/api/admin/audit/route";
import { AuditExplorer } from "@/components/audit/audit-explorer";
import { AUDIT_RETENTION_DAYS } from "@/lib/audit/constants";
import { AUDIT_PAGE_SIZE, getUserLabel, listAuditLogs, parseAuditFilters } from "@/lib/audit/queries";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Audit log · Admin · MedLife" };

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireRole("admin", "/admin/audit");
  const filters = parseAuditFilters(await searchParams);
  const [result, actorName, patientName] = await Promise.all([
    listAuditLogs(filters),
    filters.actor ? getUserLabel(filters.actor) : Promise.resolve(null),
    filters.patient ? getUserLabel(filters.patient) : Promise.resolve(null),
  ]);
  const initial: AuditFeed = {
    ...result,
    page: filters.page,
    pages: Math.max(1, Math.ceil(result.total / AUDIT_PAGE_SIZE)),
    actorName,
    patientName,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Audit log</h1>
        <p className="mt-1 text-slate-600">
          Who viewed or changed medical data and prescriptions, plus logins and admin actions. Entries can&apos;t be edited or
          deleted and are kept for {Math.round(AUDIT_RETENTION_DAYS / 365)} years. New entries appear automatically.
        </p>
      </div>
      <AuditExplorer initial={initial} initialFilters={filters} />
    </div>
  );
}
