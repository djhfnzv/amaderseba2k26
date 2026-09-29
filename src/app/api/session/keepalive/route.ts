import { NextResponse } from "next/server";
import { SESSION_IDLE_SECONDS } from "@/lib/auth/session";

/**
 * The user is active on the page (typing, scrolling, in a video call): the
 * proxy has already slid the session forward; tell the browser the new expiry.
 */
export async function POST() {
  return NextResponse.json(
    { ok: true, expiresAt: Date.now() + SESSION_IDLE_SECONDS * 1000, serverTime: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
