import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Anonymous client with no user session: sees exactly what a logged-out
 * visitor sees (e.g. only verified doctors). Use for public listings,
 * the sitemap and anything that must never include private data.
 */
export function createPublicClient() {
  return createClient<Database>(env.supabaseUrl, env.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
