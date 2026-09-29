import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Analytics } from "@/types/database";

export type AnalyticsPair = { current: Analytics; previous: Analytics | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Bangladesh as YYYY-MM-DD. */
export function todayDhaka(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Valid [from, to] (max 366 days, default last 30 days). */
export function parseRange(from?: string | null, to?: string | null): { from: string; to: string } {
  const today = todayDhaka();
  let t = to && DATE.test(to) ? to : today;
  let f = from && DATE.test(from) ? from : addDays(t, -29);
  if (f > t) [f, t] = [t, f];
  if (daysBetween(f, t) > 366) f = addDays(t, -366);
  return { from: f, to: t };
}

/** The range plus the same-length period just before it (for deltas). */
export async function getAnalytics(from: string, to: string): Promise<AnalyticsPair | null> {
  const supabase = await createClient();
  const length = daysBetween(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -length);
  const [cur, prev] = await Promise.all([
    supabase.rpc("admin_analytics", { p_from: from, p_to: to }),
    supabase.rpc("admin_analytics", { p_from: prevFrom, p_to: prevTo }),
  ]);
  if (cur.error || !cur.data) {
    if (cur.error) console.error("[admin_analytics]", cur.error.message);
    return null;
  }
  return { current: cur.data, previous: prev.data ?? null };
}
