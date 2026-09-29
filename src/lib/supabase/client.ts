import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS } from "@/lib/auth/session";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookieOptions: { ...AUTH_COOKIE_OPTIONS, secure: typeof location !== "undefined" && location.protocol === "https:" },
  });
}
