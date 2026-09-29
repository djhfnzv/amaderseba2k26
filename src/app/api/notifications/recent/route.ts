import { NextResponse } from "next/server";
import { loadRecentNotifications } from "@/lib/notifications/actions";

/**
 * The bell's background refresh (M11). A GET with x-ml-background so it
 * doesn't count as activity and keep an idle session alive.
 */
export async function GET() {
  const res = await loadRecentNotifications();
  return NextResponse.json(res, { status: res.ok ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}
