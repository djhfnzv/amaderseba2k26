import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { GUEST_ONLY_PATHS, ROLE_HOME, isRole, requiredRoleFor } from "@/lib/auth/roles";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase session cookie and applies fast, optimistic
 * role-based redirects using JWT claims (app_metadata.role / status).
 *
 * Not the only line of defence: role layouts call requireRole(), which
 * re-checks public.users, and RLS protects the data itself.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
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
  const claims = data?.claims;

  const { pathname, search } = request.nextUrl;
  const appMeta = (claims?.app_metadata ?? {}) as { role?: unknown; status?: unknown };
  const role = isRole(appMeta.role) ? appMeta.role : null;
  const suspended = appMeta.status === "suspended";

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = params ? `?${new URLSearchParams(params)}` : "";
    const res = NextResponse.redirect(url);
    // Keep any refreshed auth cookies.
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

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
