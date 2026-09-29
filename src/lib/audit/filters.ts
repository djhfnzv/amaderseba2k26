import { AUDIT_ACTIONS, AUDIT_CATEGORIES } from "@/lib/audit/constants";
import type { AuditCategory } from "@/types/database";

// Client-safe: shared by the admin page, its JSON feed and the browser.

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_EXPORT_LIMIT = 10_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Admin date filters are in Bangladesh time. */
export const ADMIN_UTC_OFFSET = "+06:00";

export type AuditFilters = {
  q: string;
  actor: string;
  patient: string;
  category: AuditCategory | "";
  action: string;
  outcome: "" | "failed";
  from: string;
  to: string;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

export function parseAuditFilters(sp: Params): AuditFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const category = one("category");
  const action = one("action");
  return {
    q: one("q").replace(/[%_,()"\\]/g, " ").trim().slice(0, 80),
    actor: UUID.test(one("actor")) ? one("actor") : "",
    patient: UUID.test(one("patient")) ? one("patient") : "",
    category: AUDIT_CATEGORIES.some((c) => c.value === category) ? (category as AuditCategory) : "",
    action: action in AUDIT_ACTIONS ? action : "",
    outcome: one("outcome") === "failed" ? "failed" : "",
    from: DATE.test(one("from")) ? one("from") : "",
    to: DATE.test(one("to")) ? one("to") : "",
    page: Math.max(1, Math.min(1000, Number(one("page")) || 1)),
  };
}

export function auditUrl(f: Partial<AuditFilters>, base = "/admin/audit"): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === "" || v == null || (k === "page" && v === 1)) continue;
    p.set(k, String(v));
  }
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}
