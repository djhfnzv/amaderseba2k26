import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME } from "@/lib/auth/roles";
import type { AppUser, Role } from "@/types/database";

/**
 * Authoritative lookup of the signed-in user: identity verified with the
 * Auth server, role/status read from public.users. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("users").select("*").eq("id", user.id).single();
  return data ?? null;
});

export async function requireUser(next?: string): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  if (user.status === "suspended") redirect("/suspended");
  return user;
}

export async function requireRole(role: Role, next?: string): Promise<AppUser> {
  const user = await requireUser(next);
  if (user.role !== role) redirect(ROLE_HOME[user.role]);
  return user;
}
