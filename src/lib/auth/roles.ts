import type { Role } from "@/types/database";

export const ROLES: readonly Role[] = ["patient", "doctor", "admin"];

/** Landing page for each role after login. */
export const ROLE_HOME: Record<Role, string> = {
  patient: "/patient",
  doctor: "/doctor",
  admin: "/admin",
};

/** Route prefixes only a given role may access. */
const PROTECTED_PREFIXES: { prefix: string; role: Role }[] = [
  { prefix: "/patient", role: "patient" },
  { prefix: "/doctor", role: "doctor" },
  { prefix: "/admin", role: "admin" },
];

/** Pages a signed-in user should not see (they go to their dashboard instead). */
export const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function requiredRoleFor(pathname: string): Role | null {
  const match = PROTECTED_PREFIXES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match?.role ?? null;
}

/**
 * Only allow same-origin relative paths ("/foo") for ?next= redirects,
 * never "//evil.com" or absolute URLs (prevents open redirects).
 */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
