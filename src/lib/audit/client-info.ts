/** Visitor IP (first hop of x-forwarded-for, as set by Vercel) and browser. */
export function clientInfo(h: Headers): { ip: string | null; userAgent: string | null } {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = (forwarded || h.get("x-real-ip") || "").slice(0, 64) || null;
  // Header values must be ASCII for fetch; strip anything else.
  const userAgent = (h.get("user-agent") ?? "").replace(/[^\x20-\x7e]/g, "").slice(0, 300) || null;
  return { ip, userAgent };
}
