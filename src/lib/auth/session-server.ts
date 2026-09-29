import "server-only";
import { cookies } from "next/headers";
import { ACTIVITY_COOKIE, activityCookieOptions } from "@/lib/auth/session";

/** Starts the 15-minute activity window right after a session is created. */
export async function markSessionActive(): Promise<void> {
  (await cookies()).set(ACTIVITY_COOKIE, String(Date.now()), activityCookieOptions(process.env.NODE_ENV === "production"));
}

/** Ends the activity window (log out). */
export async function clearSessionActivity(): Promise<void> {
  (await cookies()).set(ACTIVITY_COOKIE, "", { ...activityCookieOptions(process.env.NODE_ENV === "production"), maxAge: 0 });
}
