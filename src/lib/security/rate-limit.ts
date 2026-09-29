import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { clientInfo } from "@/lib/audit/client-info";

/**
 * Login lock-out and rate limits, kept in Upstash Redis (fast, auto-expiring
 * counters). If Redis isn't configured or can't be reached, requests are
 * allowed through (fail open) so an outage never locks everyone out.
 */

let client: Redis | null | undefined;
function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  if (!client) console.warn("[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — limits are off");
  return client;
}

const PREFIX = "ml";

/** Hash identifiers (emails, phones) so Redis never holds them in clear text. */
function hashId(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export async function requestIp(): Promise<string> {
  try {
    return clientInfo(await headers()).ip ?? "unknown";
  } catch {
    return "unknown";
  }
}

function minutes(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m === 1 ? "1 minute" : `${m} minutes`;
}

// -----------------------------------------------------------------------------
// Generic limits (sliding window)
// -----------------------------------------------------------------------------
type LimitName = keyof typeof LIMITS;

export const LIMITS = {
  signup_ip: { limit: 5, window: "1 h" },
  reset_email: { limit: 3, window: "15 m" },
  reset_ip: { limit: 10, window: "1 h" },
  sms_code_phone: { limit: 5, window: "1 h" },
  sms_code_ip: { limit: 10, window: "1 h" },
  complaint_file: { limit: 5, window: "1 h" },
  complaint_reply: { limit: 30, window: "1 h" },
  verify_lookup_ip: { limit: 30, window: "1 m" },
  medicine_search: { limit: 120, window: "1 m" },
} satisfies Record<string, { limit: number; window: Duration }>;

const limiters = new Map<LimitName, Ratelimit>();

function limiter(name: LimitName): Ratelimit | null {
  const r = redis();
  if (!r) return null;
  let l = limiters.get(name);
  if (!l) {
    l = new Ratelimit({
      redis: r,
      prefix: `${PREFIX}:rl:${name}`,
      limiter: Ratelimit.slidingWindow(LIMITS[name].limit, LIMITS[name].window),
      analytics: false,
    });
    limiters.set(name, l);
  }
  return l;
}

export type LimitResult = { ok: true } | { ok: false; retryAfter: string };

/**
 * Counts one attempt for `id` (a user id, IP, or an email/phone — hashed) and
 * says whether it's allowed.
 */
export async function rateLimit(name: LimitName, id: string, opts: { hash?: boolean } = {}): Promise<LimitResult> {
  const l = limiter(name);
  if (!l) return { ok: true };
  try {
    const res = await l.limit(opts.hash ? hashId(id) : id);
    return res.success ? { ok: true } : { ok: false, retryAfter: minutes(res.reset - Date.now()) };
  } catch (e) {
    console.error("[rate-limit]", name, (e as Error).message);
    return { ok: true };
  }
}

// -----------------------------------------------------------------------------
// Login lock-out: failed attempts only, per email and per IP
// -----------------------------------------------------------------------------
export const LOGIN_LOCK = {
  emailFailures: 5, // this many wrong passwords for one account…
  ipFailures: 20, // …or from one network…
  windowSeconds: 15 * 60, // …within 15 minutes locks it for the rest of the window
};

const emailKey = (email: string) => `${PREFIX}:login:email:${hashId(email)}`;
const ipKey = (ip: string) => `${PREFIX}:login:ip:${ip}`;

/** Is this email or IP currently locked? Checked before trying the password. */
export async function loginLocked(email: string, ip: string): Promise<{ locked: false } | { locked: true; retryAfter: string; by: "email" | "ip" }> {
  const r = redis();
  if (!r) return { locked: false };
  try {
    const [e, i] = await r.mget<(number | null)[]>(emailKey(email), ipKey(ip));
    const by = (e ?? 0) >= LOGIN_LOCK.emailFailures ? "email" : (i ?? 0) >= LOGIN_LOCK.ipFailures ? "ip" : null;
    if (!by) return { locked: false };
    const ttl = await r.ttl(by === "email" ? emailKey(email) : ipKey(ip));
    return { locked: true, by, retryAfter: minutes(Math.max(ttl, 60) * 1000) };
  } catch (err) {
    console.error("[loginLocked]", (err as Error).message);
    return { locked: false };
  }
}

/** Records a wrong password. Returns how many tries are left for the account. */
export async function recordLoginFailure(email: string, ip: string): Promise<number | null> {
  const r = redis();
  if (!r) return null;
  try {
    const p = r.pipeline();
    p.incr(emailKey(email));
    p.expire(emailKey(email), LOGIN_LOCK.windowSeconds, "NX");
    p.incr(ipKey(ip));
    p.expire(ipKey(ip), LOGIN_LOCK.windowSeconds, "NX");
    const [count] = await p.exec<[number, number, number, number]>();
    return Math.max(0, LOGIN_LOCK.emailFailures - count);
  } catch (err) {
    console.error("[recordLoginFailure]", (err as Error).message);
    return null;
  }
}

/** Successful login (or an admin unlocking the account) clears the account's counter. */
export async function clearLoginFailures(email: string): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.del(emailKey(email));
  } catch (err) {
    console.error("[clearLoginFailures]", (err as Error).message);
  }
}

/** For the admin user page: is this account locked right now? */
export async function accountLockStatus(email: string | null): Promise<{ failures: number; secondsLeft: number } | null> {
  const r = redis();
  if (!r || !email) return null;
  try {
    const failures = (await r.get<number>(emailKey(email))) ?? 0;
    if (!failures) return { failures: 0, secondsLeft: 0 };
    return { failures, secondsLeft: Math.max(0, await r.ttl(emailKey(email))) };
  } catch {
    return null;
  }
}
