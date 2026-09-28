"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Full-screen splash for signing in and out. Mounted once in the root layout
 * so it survives the page change.
 *
 * Log in (teal):  the logo floats up out of the background and bobs while
 *   the password is checked; once the dashboard has loaded underneath it
 *   expands to fill the screen and dissolves into the page. A failed login
 *   fades the splash away so the form can show the error.
 * Log out (crimson): the reverse — the page washes to white, the white
 *   gathers back into the logo, and once the login page is underneath the
 *   logo sinks into the background and the splash fades away.
 */

type Mode = "login" | "logout";
type Phase = "idle" | "enter" | "exit" | "cancel";
type State = { phase: Phase; mode: Mode; label: string };

const MIN_ENTER_MS = 1100; // let the entrance finish even on fast requests
const EXIT_MS = { login: 760 + 380, logout: 620 + 320 };
const CANCEL_MS = 240;
const GIVE_UP_MS = 15_000;

let state: State = { phase: "idle", mode: "login", label: "" };
let startedAt = 0;
let fromPath = "";
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const IDLE: State = { phase: "idle", mode: "login", label: "" };

function start(mode: Mode, label: string) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  startedAt = performance.now();
  fromPath = window.location.pathname;
  set({ phase: "enter", mode, label });
}

/** Call from the login / sign-up form's submit handler. */
export function startLoginSplash(label = "Signing you in…") {
  start("login", label);
}

/** Call from the log-out form's submit handler. */
export function startLogoutSplash(label = "Signing you out…") {
  start("logout", label);
}

/** The request failed: fade the splash away. */
export function cancelLoginSplash() {
  if (state.phase !== "enter") return;
  set({ phase: "cancel" });
  setTimeout(() => state.phase === "cancel" && set({ phase: "idle" }), CANCEL_MS);
}

const THEME: Record<Mode, { bg: string; glowA: string; glowB: string; tile: string; sub: string; title: string }> = {
  login: {
    bg: "from-teal-950 via-teal-800 to-emerald-700",
    glowA: "bg-teal-400/20",
    glowB: "bg-emerald-300/15",
    tile: "text-teal-700 shadow-teal-950/50",
    sub: "text-teal-100/80",
    title: "MedLife",
  },
  logout: {
    bg: "from-rose-950 via-red-900 to-rose-700",
    glowA: "bg-rose-400/20",
    glowB: "bg-red-300/15",
    tile: "text-rose-800 shadow-rose-950/50",
    sub: "text-rose-100/80",
    title: "See you soon",
  },
};

export function LoginSplash() {
  const { phase, mode, label } = useSyncExternalStore(subscribe, () => state, () => IDLE);
  const pathname = usePathname();

  // Landed on the new page: finish the entrance, then play the exit into it.
  useEffect(() => {
    if (phase !== "enter" || pathname === fromPath) return;
    const wait = Math.max(0, MIN_ENTER_MS - (performance.now() - startedAt));
    const t = setTimeout(() => {
      set({ phase: "exit" });
      setTimeout(() => state.phase === "exit" && set({ phase: "idle" }), EXIT_MS[state.mode]);
    }, wait);
    return () => clearTimeout(t);
  }, [phase, pathname]);

  // Never leave the screen covered if something goes wrong.
  useEffect(() => {
    if (phase !== "enter") return;
    const t = setTimeout(cancelLoginSplash, GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "idle") return null;
  const t = THEME[mode];
  const entering = phase === "enter";
  const exiting = phase === "exit";

  const overlayAnim = entering
    ? "animate-splash-in"
    : exiting
      ? mode === "login"
        ? "animate-splash-out"
        : "animate-splash-out-late"
      : "animate-splash-cancel";
  const tileAnim = exiting
    ? mode === "login"
      ? "animate-logo-expand"
      : "animate-logo-sink"
    : mode === "login"
      ? "animate-logo-rise"
      : "animate-logo-shrink";
  // Login: the "+" fades as the tile grows. Logout: it appears once the white has gathered.
  const iconAnim = exiting && mode === "login" ? "opacity-0" : entering && mode === "logout" ? "animate-icon-in" : "";

  return (
    <div role="status" aria-live="polite" className={`fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-gradient-to-br ${t.bg} ${overlayAnim}`}>
      {/* Soft light in the background */}
      <div aria-hidden="true" className={`absolute -top-40 -left-40 size-[32rem] rounded-full blur-3xl ${t.glowA}`} />
      <div aria-hidden="true" className={`absolute -right-32 -bottom-48 size-[36rem] rounded-full blur-3xl ${t.glowB}`} />

      <div className="relative flex flex-col items-center">
        <div className={entering ? "animate-logo-float" : ""}>
          <div className={`relative ${tileAnim}`}>
            {entering && (
              <span aria-hidden="true" className="absolute inset-0 animate-splash-pulse rounded-[1.75rem] bg-white/40" />
            )}
            <span className={`relative grid size-20 place-items-center rounded-[1.75rem] bg-white shadow-2xl ${t.tile}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className={`size-11 transition-opacity duration-200 ${iconAnim}`}>
                <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4Z" />
              </svg>
            </span>
          </div>
        </div>
        <p className={`mt-7 text-2xl font-bold tracking-tight text-white ${exiting ? "animate-word-out" : "animate-word-in"}`}>{t.title}</p>
        <p className={`mt-1 text-sm ${t.sub} ${exiting ? "animate-word-out" : "animate-word-in"}`}>{label}</p>
      </div>
    </div>
  );
}
