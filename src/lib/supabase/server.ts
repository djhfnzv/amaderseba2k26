import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { clientInfo } from "@/lib/audit/client-info";
import { AUTH_COOKIE_OPTIONS } from "@/lib/auth/session";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/** Supabase client acting as the signed-in user (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();

  // The visitor's IP/browser go along so audit triggers can record them (M14).
  let auditHeaders: Record<string, string> = {};
  try {
    const { ip, userAgent } = clientInfo(await headers());
    auditHeaders = {
      ...(ip ? { "x-medlife-ip": ip } : {}),
      ...(userAgent ? { "x-medlife-ua": userAgent } : {}),
    };
  } catch {
    // Outside a request (e.g. inside after() in a Server Component).
  }

  return createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    global: { headers: auditHeaders },
    // Auth cookies live 15 minutes, extended by activity (see proxy.ts).
    cookieOptions: { ...AUTH_COOKIE_OPTIONS, secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts refreshes the session, so this can be ignored.
        }
      },
    },
  });
}
