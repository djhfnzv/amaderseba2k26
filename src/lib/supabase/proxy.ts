import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { GUEST_ONLY_PATHS, ROLE_HOME, isRole, requiredRoleFor } from "@/lib/auth/roles";
import {
  ACTIVITY_COOKIE,
  AUTH_COOKIE_OPTIONS,
  SESSION_IDLE_SECONDS,
  SESSION_START_PATHS,
  activityCookieOptions,
  isBackgroundRequest,
} from "@/lib/auth/session";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase session cookie and applies fast, optimistic
 * role-based redirects using JWT claims (app_metadata.role / status).
 *
 * Sessions end after 15 minutes without activity: every user action slides
 * the auth cookies' and the ml_seen cookie's lifetime forward; background
 * requests (prefetches, live polling) don't. An idle session is signed out
 * here, server side, on its next request.
 *
 * Not the only line of defence: role layouts call requireRole(), which
 * re-checks public.users, and RLS protects the data itself.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const secure = request.nextUrl.protocol === "https:";

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookieOptions: { ...AUTH_COOKIE_OPTIONS, secure },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  let claims = data?.claims;

  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = params ? `?${new URLSearchParams(params)}` : "";
    const res = NextResponse.redirect(url);
    // Keep any refreshed (or cleared) auth cookies.
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // ---------------------------------------------------------------------------
  // 15-minute idle timeout
  // ---------------------------------------------------------------------------
  if (claims) {
    const seen = Number(request.cookies.get(ACTIVITY_COOKIE)?.value);
    const idle = !Number.isFinite(seen) || seen <= 0 || Date.now() - seen > SESSION_IDLE_SECONDS * 1000;
    const startingSession = SESSION_START_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

    if (idle && !startingSession) {
      // Revokes this session's refresh token and clears the auth cookies.
      await supabase.auth.signOut({ scope: "local" });
      response.cookies.set(ACTIVITY_COOKIE, "", { ...activityCookieOptions(secure), maxAge: 0 });
      if (isApi) {
        const res = NextResponse.json({ error: "Session expired", reason: "idle" }, { status: 401 });
        response.cookies.getAll().forEach((c) => res.cookies.set(c));
        return res;
      }
      if (requiredRoleFor(pathname)) {
        return redirectTo("/login", { next: pathname + search, reason: "idle" });
      }
      claims = undefined; // carry on as a visitor
    } else if (!isBackgroundRequest(request.headers)) {
      // A real action: slide the session forward another 15 minutes.
      response.cookies.set(ACTIVITY_COOKIE, String(Date.now()), activityCookieOptions(secure));
      for (const c of request.cookies.getAll()) {
        if (c.name.startsWith("sb-") && !response.cookies.get(c.name)) {
          response.cookies.set(c.name, c.value, { ...AUTH_COOKIE_OPTIONS, secure });
        }
      }
    }
  }

  const appMeta = (claims?.app_metadata ?? {}) as { role?: unknown; status?: unknown };
  const role = isRole(appMeta.role) ? appMeta.role : null;
  const suspended = appMeta.status === "suspended";

  const required = requiredRoleFor(pathname);
  if (required) {
    if (!claims) return redirectTo("/login", { next: pathname + search });
    if (suspended) return redirectTo("/suspended");
    if (role && role !== required) return redirectTo(ROLE_HOME[role]);
  }

  if (claims && role && !suspended && GUEST_ONLY_PATHS.includes(pathname)) {
    return redirectTo(ROLE_HOME[role]);
  }

  return response;
}
