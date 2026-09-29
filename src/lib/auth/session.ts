// Session lifetime rules shared by the proxy, the Supabase clients and the
// in-app session guard. Safe to import anywhere (no server-only APIs).

/** Signed-in sessions end after this much inactivity. */
export const SESSION_IDLE_SECONDS = 15 * 60;

/** Last-activity timestamp (ms), httpOnly, sliding 15-minute lifetime. */
export const ACTIVITY_COOKIE = "ml_seen";

/** Auth cookies expire with the session instead of Supabase's 400-day default. */
export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: false, // the browser client needs to read them
  maxAge: SESSION_IDLE_SECONDS,
};

export function activityCookieOptions(secure: boolean) {
  return { path: "/", sameSite: "lax" as const, httpOnly: true, secure, maxAge: SESSION_IDLE_SECONDS };
}

/** Requests that aren't the user doing something (don't extend the session). */
export const BACKGROUND_HEADER = "x-ml-background";

export function isBackgroundRequest(headers: Headers): boolean {
  return (
    headers.get(BACKGROUND_HEADER) === "1" ||
    headers.get("next-router-prefetch") === "1" ||
    headers.get("purpose") === "prefetch" ||
    headers.get("sec-purpose")?.includes("prefetch") === true
  );
}

/** Auth flows that start a session from an email link (no activity stamp yet). */
export const SESSION_START_PATHS = ["/auth/confirm", "/reset-password"];

/** Why someone was signed out (shown on the login page). */
export const SIGNED_OUT_REASON: Record<string, string> = {
  idle: "You were signed out after 15 minutes of inactivity. Please log in again.",
  offline: "The connection to MedLife was lost, so we signed you out to keep your data safe. Please log in again.",
};
