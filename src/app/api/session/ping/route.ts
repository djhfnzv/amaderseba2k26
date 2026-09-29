import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVITY_COOKIE, SESSION_IDLE_SECONDS } from "@/lib/auth/session";

/**
 * Heartbeat for the session guard (sent as a background request, so it never
 * extends the session). If the session is already idle the proxy answers 401
 * before this runs. A failed/timed-out ping tells the browser the server is
 * unreachable.
 */
export async function GET() {
  const seen = Number((await cookies()).get(ACTIVITY_COOKIE)?.value);
  const expiresAt = Number.isFinite(seen) && seen > 0 ? seen + SESSION_IDLE_SECONDS * 1000 : null;
  return NextResponse.json({ ok: true, expiresAt, serverTime: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
