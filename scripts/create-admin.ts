/**
 * Creates (or resets) the platform admin from ADMIN_EMAIL / ADMIN_PASSWORD
 * in .env.local. Safe to run repeatedly.
 *
 *   npm run create-admin
 *
 * Uses the Supabase secret key, so it must only ever run on a trusted machine.
 */
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✖ Missing ${name} in .env.local`);
    process.exit(1);
  }
  return value;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const secret = env("SUPABASE_SECRET_KEY");
const email = env("ADMIN_EMAIL").toLowerCase();
const password = env("ADMIN_PASSWORD");
const fullName = process.env.ADMIN_NAME?.trim() || "MedLife Admin";

if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error("✖ ADMIN_PASSWORD must be at least 12 characters with a letter and a number.");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserId(): Promise<string | null> {
  const { data } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
  if (data?.id) return data.id;

  // Fall back to the Auth user list (e.g. if the profile row is missing).
  for (let page = 1; page <= 50; page++) {
    const { data: list, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = list.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (list.users.length < 200) break;
  }
  return null;
}

async function main() {
  let id = await findUserId();

  if (id) {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`• Existing account found — password reset for ${email}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) throw error ?? new Error("createUser returned no user");
    id = data.user.id;
    console.log(`• Created account ${email}`);
  }

  // Promote. The DB trigger mirrors role/status into the JWT (app_metadata).
  const { error: roleError } = await supabase
    .from("users")
    .update({ role: "admin", status: "active", suspended_reason: null })
    .eq("id", id);
  if (roleError) throw roleError;

  console.log(`✔ ${email} is an admin. Log in at /login (log out first if already signed in).`);
}

main().catch((err) => {
  console.error("✖ Failed:", err?.message ?? err);
  process.exit(1);
});
