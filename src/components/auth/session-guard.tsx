"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BACKGROUND_HEADER } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/client";

const PING_EVERY_MS = 20_000;
const PING_TIMEOUT_MS = 8_000;
const FAILS_BEFORE_LOST = 2; // ~20–40 s without the server
const OFFLINE_GRACE_MS = 10_000;
const WARN_BEFORE_MS = 90_000;
const KEEPALIVE_THROTTLE_MS = 60_000;
const KEEPALIVE_IN_CALL_MS = 4 * 60_000;

/** Deletes the Supabase auth cookies in this browser (works offline). */
function destroyAuthCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name?.startsWith("sb-")) {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    }
  }
}

/**
 * Keeps the 15-minute session honest in the browser:
 *  - real activity (typing, clicking, scrolling) extends it, throttled;
 *  - 90 s before it runs out, a dialog offers "Stay signed in";
 *  - at zero the user is signed out;
 *  - if the server can't be reached (two failed heartbeats, or the device
 *    stays offline), the session cookies are destroyed and the page locks.
 * `keepAlive` (video room): the session is extended while the page is open.
 */
export function SessionGuard({ initialExpiresAt, keepAlive = false }: { initialExpiresAt?: number | null; keepAlive?: boolean }) {
  const [expiresAt, setExpiresAt] = useState<number | null>(initialExpiresAt ?? null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [lost, setLost] = useState(false);
  const [online, setOnline] = useState(true);
  const offset = useRef(0); // server clock - browser clock
  const fails = useRef(0);
  const lastKeepalive = useRef(0);
  const ending = useRef(false);

  const leave = useCallback((reason: "idle" | "offline") => {
    if (ending.current) return;
    ending.current = true;
    const next = encodeURIComponent(location.pathname + location.search);
    void fetch(`/api/session/end?reason=${reason}`, { method: "POST", keepalive: true }).catch(() => {});
    destroyAuthCookies();
    location.replace(`/login?reason=${reason}&next=${next}`);
  }, []);

  const connectionLost = useCallback(() => {
    if (ending.current) return;
    destroyAuthCookies();
    // Best effort: also drop the in-memory session (fails quietly when offline).
    void createClient().auth.signOut({ scope: "local" }).catch(() => {});
    destroyAuthCookies();
    setLost(true);
  }, []);

  const applyServer = useCallback((data: { expiresAt?: number | null; serverTime?: number }) => {
    if (data.serverTime) offset.current = data.serverTime - Date.now();
    if (data.expiresAt) setExpiresAt(data.expiresAt);
  }, []);

  const keepSessionAlive = useCallback(async () => {
    lastKeepalive.current = Date.now();
    try {
      const res = await fetch("/api/session/keepalive", { method: "POST", cache: "no-store" });
      if (res.status === 401) return leave("idle");
      if (res.ok) applyServer(await res.json());
    } catch {
      /* the heartbeat decides whether the connection is lost */
    }
  }, [applyServer, leave]);

  // Heartbeat: is the server there, and when does the session end?
  useEffect(() => {
    if (lost) return;
    async function ping() {
      if (ending.current) return;
      try {
        const res = await fetch("/api/session/ping", {
          headers: { [BACKGROUND_HEADER]: "1" },
          cache: "no-store",
          signal: AbortSignal.timeout(PING_TIMEOUT_MS),
        });
        if (res.status === 401) return leave("idle");
        if (!res.ok) throw new Error(String(res.status));
        fails.current = 0;
        applyServer(await res.json());
      } catch {
        fails.current += 1;
        if (fails.current >= FAILS_BEFORE_LOST) connectionLost();
      }
    }
    void ping();
    const t = setInterval(ping, PING_EVERY_MS);
    return () => clearInterval(t);
  }, [lost, applyServer, connectionLost, leave]);

  // Device goes offline: give it a few seconds, then lock.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = () => {
      setOnline(false);
      timer = setTimeout(connectionLost, OFFLINE_GRACE_MS);
    };
    const on = () => {
      setOnline(true);
      if (timer) clearTimeout(timer);
    };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
      if (timer) clearTimeout(timer);
    };
  }, [connectionLost]);

  // Real activity extends the session (at most once a minute).
  useEffect(() => {
    if (lost) return;
    const onActivity = () => {
      if (Date.now() - lastKeepalive.current > KEEPALIVE_THROTTLE_MS) void keepSessionAlive();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const call = keepAlive ? setInterval(() => void keepSessionAlive(), KEEPALIVE_IN_CALL_MS) : null;
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (call) clearInterval(call);
    };
  }, [lost, keepAlive, keepSessionAlive]);

  // Countdown.
  useEffect(() => {
    if (!expiresAt || lost) return;
    const tick = () => {
      const left = expiresAt - (Date.now() + offset.current);
      if (left <= 0) return leave("idle");
      setRemaining(left <= WARN_BEFORE_MS ? left : null);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt, lost, leave]);

  if (lost) {
    return (
      <div className="fixed inset-0 z-[100] grid animate-fade-in place-items-center bg-slate-900/60 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="lost-title">
        <div className="w-full max-w-sm animate-scale-in rounded-2xl bg-white p-6 text-center shadow-2xl">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-100 text-amber-700" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01M3 3l18 18" />
            </svg>
          </span>
          <h2 id="lost-title" className="mt-4 text-lg font-semibold text-slate-900">Connection lost</h2>
          <p className="mt-1 text-sm text-slate-600">
            We couldn&apos;t reach MedLife, so we signed you out on this device to keep your health data safe.
          </p>
          <button
            type="button"
            disabled={!online}
            onClick={() => location.replace(`/login?reason=offline&next=${encodeURIComponent(location.pathname)}`)}
            className="mt-5 h-11 w-full rounded-lg bg-teal-700 text-sm font-semibold text-white transition-[background-color,scale] hover:bg-teal-800 active:scale-[0.98] disabled:opacity-60"
          >
            {online ? "Log in again" : "Waiting for connection…"}
          </button>
        </div>
      </div>
    );
  }

  if (remaining === null) return null;
  const seconds = Math.ceil(remaining / 1000);
  return (
    <div
      role="alertdialog"
      aria-labelledby="idle-title"
      className="fixed right-4 bottom-4 z-[90] w-[min(22rem,calc(100vw-2rem))] animate-toast-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
    >
      <div className="p-4">
        <p id="idle-title" className="font-semibold text-slate-900">Still there?</p>
        <p className="mt-1 text-sm text-slate-600">
          For your security you&apos;ll be signed out in <strong className="tabular-nums text-slate-900">{seconds}s</strong>.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void keepSessionAlive()}
            className="h-9 flex-1 rounded-lg bg-teal-700 text-sm font-semibold text-white transition-[background-color,scale] hover:bg-teal-800 active:scale-[0.98]"
          >
            Stay signed in
          </button>
          <button type="button" onClick={() => leave("idle")} className="h-9 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Sign out
          </button>
        </div>
      </div>
      <div className="h-1 bg-slate-100">
        <div
          className="h-full bg-amber-500 transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.max(0, Math.min(100, (remaining / WARN_BEFORE_MS) * 100))}%` }}
        />
      </div>
    </div>
  );
}

