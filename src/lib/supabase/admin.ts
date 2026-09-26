import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Privileged client using the secret key. BYPASSES RLS.
 * Only use in server code for operations a user cannot do themselves.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Missing environment variable: SUPABASE_SECRET_KEY");

  return createClient<Database>(env.supabaseUrl, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
