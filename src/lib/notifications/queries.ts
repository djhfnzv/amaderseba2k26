import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AppNotification, NotificationPreferences, SmsOutbox, SmsStatus } from "@/types/database";

export const NOTIFICATIONS_PAGE_SIZE = 30;

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

export async function listNotifications(
  userId: string,
  opts: { page?: number; limit?: number; unreadOnly?: boolean } = {},
): Promise<{ items: AppNotification[]; hasMore: boolean }> {
  const limit = opts.limit ?? NOTIFICATIONS_PAGE_SIZE;
  const from = ((opts.page ?? 1) - 1) * limit;
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, from + limit); // one extra row tells us if there's another page
  if (opts.unreadOnly) query = query.is("read_at", null);
  const { data } = await query;
  const rows = data ?? [];
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getPreferences(userId: string): Promise<NotificationPreferences | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

// -----------------------------------------------------------------------------
// Admin: SMS log
// -----------------------------------------------------------------------------
export type SmsLogRow = SmsOutbox & { user_name: string | null };

export async function listSmsLog(opts: { status?: SmsStatus; limit?: number } = {}): Promise<SmsLogRow[]> {
  const supabase = await createClient();
  let query = supabase.from("sms_outbox").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.status) query = query.eq("status", opts.status);
  const { data } = await query;
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id))];
  const { data: users } = ids.length
    ? await supabase.from("users").select("id, full_name, email").in("id", ids)
    : { data: [] as { id: string; full_name: string; email: string | null }[] };
  const names = new Map((users ?? []).map((u) => [u.id, u.full_name || u.email]));
  return rows.map((r) => ({ ...r, user_name: r.user_id ? (names.get(r.user_id) ?? null) : null }));
}

export async function smsCounts(): Promise<Record<SmsStatus, number>> {
  const supabase = await createClient();
  const statuses: SmsStatus[] = ["pending", "sending", "sent", "failed", "cancelled"];
  const counts = await Promise.all(
    statuses.map((s) => supabase.from("sms_outbox").select("id", { count: "exact", head: true }).eq("status", s)),
  );
  return Object.fromEntries(statuses.map((s, i) => [s, counts[i].count ?? 0])) as Record<SmsStatus, number>;
}
