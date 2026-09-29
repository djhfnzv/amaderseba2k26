import "server-only";
import { ADMIN_UTC_OFFSET, AUDIT_PAGE_SIZE, type AuditFilters } from "@/lib/audit/filters";
import { createClient } from "@/lib/supabase/server";
import type { AuditLog, RecordAccessRow } from "@/types/database";

export { AUDIT_EXPORT_LIMIT, AUDIT_PAGE_SIZE, auditUrl, parseAuditFilters, type AuditFilters } from "@/lib/audit/filters";

function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type AuditListResult = {
  rows: AuditLog[];
  total: number;
  /** Names for patient ids shown in the rows. */
  patients: Record<string, string>;
};

/**
 * One page of entries, newest first. With `afterId`, only entries newer than
 * that id (for live updates) — `total` is then the number of new entries.
 */
export async function listAuditLogs(
  f: AuditFilters,
  opts: { limit?: number; offset?: number; afterId?: number } = {},
): Promise<AuditListResult> {
  const supabase = await createClient();
  const limit = opts.limit ?? AUDIT_PAGE_SIZE;
  const offset = opts.offset ?? (f.page - 1) * AUDIT_PAGE_SIZE;

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(opts.afterId ? 0 : offset, (opts.afterId ? 0 : offset) + limit - 1);
  if (opts.afterId) query = query.gt("id", opts.afterId);
  if (f.q) query = query.or(`actor_label.ilike."%${f.q}%",target_id.ilike."%${f.q}%",ip.eq."${f.q}"`);
  if (f.actor) query = query.eq("actor_id", f.actor);
  if (f.patient) query = query.eq("patient_id", f.patient);
  if (f.category) query = query.eq("category", f.category);
  if (f.action) query = query.eq("action", f.action);
  if (f.outcome === "failed") query = query.eq("success", false);
  if (f.from) query = query.gte("occurred_at", `${f.from}T00:00:00${ADMIN_UTC_OFFSET}`);
  if (f.to) query = query.lt("occurred_at", `${nextDay(f.to)}T00:00:00${ADMIN_UTC_OFFSET}`);

  const { data, count, error } = await query;
  if (error) console.error("[listAuditLogs]", error.message);
  const rows = data ?? [];

  const ids = [...new Set(rows.map((r) => r.patient_id).filter((id): id is string => !!id))];
  let patients: Record<string, string> = {};
  if (ids.length) {
    const { data: users } = await supabase.from("users").select("id, full_name, email").in("id", ids);
    patients = Object.fromEntries((users ?? []).map((u) => [u.id, u.full_name || u.email || "Patient"]));
  }
  return { rows, total: count ?? 0, patients };
}

export async function getUserLabel(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("full_name, email").eq("id", id).maybeSingle();
  return data ? data.full_name || data.email || null : null;
}

/** Patient's own "who opened my records" list. */
export async function listMyRecordAccess(page: number, pageSize = 30): Promise<{ rows: RecordAccessRow[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_record_access", { p_limit: pageSize, p_offset: (page - 1) * pageSize });
  if (error) console.error("[listMyRecordAccess]", error.message);
  const rows = data ?? [];
  return { rows, total: rows[0]?.total_count ?? 0 };
}
