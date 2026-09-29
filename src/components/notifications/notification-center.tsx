"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { isSoundMuted, playChime, setSoundMuted, subscribeSoundMuted, unlockAudioOnGesture } from "@/components/notifications/chime";
import { markNotificationsRead, type loadRecentNotifications } from "@/lib/notifications/actions";
import { backgroundFetch } from "@/lib/auth/background-fetch";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/types/database";

type Ctx = {
  unread: number;
  items: AppNotification[] | null;
  href: string;
  refresh: () => void;
  markAll: () => void;
  pending: boolean;
  /** Bumps when a new notification arrives (rings the bell). */
  ring: number;
};

const NotificationsContext = createContext<Ctx | null>(null);

const POLL_MS = 45_000;
const TOAST_MS = 7_000;
const MAX_TOASTS = 3;
const FLASH_COOKIE = "ml_flash";

type Toast = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  kind: "notification" | "success" | "info";
  /** Playing its exit animation. */
  leaving?: boolean;
};

const EXIT_MS = 320;

/** Reads (and clears) the one-off confirmation set by a server action (see lib/flash.ts). */
function takeFlash(): { id: string; text: string; kind: "success" | "info" } | null {
  const m = document.cookie.match(/(?:^|;\s*)ml_flash=([^;]+)/);
  if (!m) return null;
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
  try {
    const bin = atob(m[1].replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const v = JSON.parse(json) as { id?: unknown; text?: unknown; kind?: unknown };
    if (typeof v.id !== "string" || typeof v.text !== "string") return null;
    return { id: v.id, text: v.text, kind: v.kind === "info" ? "info" : "success" };
  } catch {
    return null;
  }
}

/**
 * Holds the unread count and latest notifications for the bell(s). New ones
 * arrive live (Supabase Realtime, with polling as a fallback), play a chime
 * and pop up as a toast; the notifications page refreshes itself.
 */
export function NotificationCenter({
  userId,
  initialUnread,
  href,
  children,
}: {
  userId: string;
  initialUnread: number;
  href: string;
  children: React.ReactNode;
}) {
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ring, setRing] = useState(0);
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  const router = useRouter();

  // IDs we've already shown; the first load only fills this (no pop-ups for old items).
  const seen = useRef(new Set<string>());
  const primed = useRef(false);
  const onNotificationsPage = useRef(false);
  // Auto-dismiss timers; paused while the pointer is over a toast.
  const timers = useRef(new Map<string, { t: ReturnType<typeof setTimeout> | null; until: number; left: number }>());
  const toastsRef = useRef<Toast[]>([]);
  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  useEffect(() => {
    onNotificationsPage.current = pathname.endsWith("/notifications");
  }, [pathname]);

  /** Slide the toast out, then remove it. */
  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer?.t) clearTimeout(timer.t);
    timers.current.delete(id);
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const schedule = useCallback(
    (id: string, ms: number) => {
      timers.current.set(id, { t: setTimeout(() => dismiss(id), ms), until: Date.now() + ms, left: ms });
    },
    [dismiss],
  );
  const pause = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (!timer?.t) return;
    clearTimeout(timer.t);
    timers.current.set(id, { t: null, until: 0, left: Math.max(0, timer.until - Date.now()) });
  }, []);
  const resume = useCallback(
    (id: string) => {
      const timer = timers.current.get(id);
      if (timer && !timer.t) schedule(id, Math.max(1500, timer.left));
    },
    [schedule],
  );

  /** Pop-up(s) + chime. Older toasts beyond the limit slide away. */
  const showToasts = useCallback(
    (incoming: Toast[]) => {
      const fresh = incoming.filter((t) => !toastsRef.current.some((x) => x.id === t.id)).slice(0, MAX_TOASTS);
      if (!fresh.length) return;
      playChime();
      const visible = toastsRef.current.filter((t) => !t.leaving);
      visible.slice(Math.max(0, MAX_TOASTS - fresh.length)).forEach((t) => dismiss(t.id));
      setToasts((list) => [...fresh, ...list]);
      fresh.forEach((t) => schedule(t.id, TOAST_MS));
    },
    [dismiss, schedule],
  );

  /** New notifications: pop-up + chime, and refresh the full list page. */
  const announce = useCallback(
    (fresh: AppNotification[]) => {
      if (!fresh.length) return;
      setRing((r) => r + 1);
      showToasts(
        fresh.slice(0, MAX_TOASTS).map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          href: `/notifications/open/${n.id}`,
          kind: "notification" as const,
        })),
      );
      if (onNotificationsPage.current) router.refresh();
    },
    [showToasts, router],
  );

  // Confirmations of the user's own actions ("Profile saved"): a server
  // action sets a short-lived cookie; pick it up as soon as it lands.
  useEffect(() => {
    const check = () => {
      const f = takeFlash();
      if (f) showToasts([{ id: `flash:${f.id}`, title: f.text, body: null, href: null, kind: f.kind }]);
    };
    check();
    const t = setInterval(check, 600);
    return () => clearInterval(t);
  }, [showToasts, pathname]);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await backgroundFetch<Awaited<ReturnType<typeof loadRecentNotifications>>>("/api/notifications/recent");
      if (!res?.ok) return;
      const fresh = primed.current ? res.data.items.filter((n) => !n.read_at && !seen.current.has(n.id)) : [];
      res.data.items.forEach((n) => seen.current.add(n.id));
      primed.current = true;
      setItems(res.data.items);
      setUnread(res.data.unread);
      announce(fresh);
    });
  }, [announce]);

  // First load (silent), then re-sync on navigation, when the server count
  // changes (after an action), when the tab comes back, and every 45 s.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    refresh();
  }, [pathname, refresh]);

  const lastInitial = useRef(initialUnread);
  useEffect(() => {
    if (lastInitial.current === initialUnread) return;
    lastInitial.current = initialUnread;
    refresh();
  }, [initialUnread, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const stopUnlock = unlockAudioOnGesture();
    const toastTimers = timers.current;
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      stopUnlock();
      toastTimers.forEach((timer) => timer.t && clearTimeout(timer.t));
    };
  }, [refresh]);

  // Live: a row inserted for this user shows up immediately.
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          ({ new: row }) => {
            const n = row as AppNotification;
            if (seen.current.has(n.id)) return;
            seen.current.add(n.id);
            setUnread((u) => u + 1);
            setItems((list) => (list ? [n, ...list.filter((x) => x.id !== n.id)].slice(0, 8) : list));
            announce([n]);
          },
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, announce]);

  const markAll = useCallback(() => {
    startTransition(async () => {
      const res = await markNotificationsRead();
      if (res.ok) {
        setUnread(0);
        setItems((list) => list?.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })) ?? null);
      }
    });
  }, []);

  return (
    <NotificationsContext.Provider value={{ unread, items, href, refresh, markAll, pending, ring }}>
      {children}
      <Toasts toasts={toasts} onDismiss={dismiss} onPause={pause} onResume={resume} />
    </NotificationsContext.Provider>
  );
}

/**
 * Pop-ups in the corner. Newest sits at the bottom; each one springs in,
 * shows a shrinking progress bar (paused on hover) and slides out while the
 * others close the gap smoothly.
 */
function Toasts({
  toasts,
  onDismiss,
  onPause,
  onResume,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-label="New notifications"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col-reverse items-end sm:inset-x-auto sm:right-6 sm:bottom-6 print:hidden"
    >
      {toasts.map((n) => (
        // Outer grid row collapses to 0 on exit so the stack slides together.
        <div
          key={n.id}
          className={`grid w-full transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-soft)] sm:w-96 ${
            n.leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          }`}
        >
          <div className={`min-h-0 ${n.leaving ? "overflow-hidden" : ""}`}>
            <div className="pt-2">
              <div
                role="status"
                onMouseEnter={() => onPause(n.id)}
                onMouseLeave={() => onResume(n.id)}
                onFocus={() => onPause(n.id)}
                onBlur={() => onResume(n.id)}
                className={`group pointer-events-auto relative flex animate-toast-in items-start gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl shadow-slate-900/10 backdrop-blur transition-[translate,scale] duration-300 ease-[var(--ease-soft)] ${
                  n.leaving ? "translate-x-8 scale-95" : ""
                }`}
              >
                {n.kind === "notification" ? (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700" aria-hidden="true">
                    <BellIcon className="size-5 origin-top animate-bell-ring" />
                  </span>
                ) : (
                  <span
                    className="grid size-9 shrink-0 animate-badge-pop place-items-center rounded-full bg-emerald-50 text-emerald-700"
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="size-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path
                        d="M5 12.5l4.5 4.5L19 7.5"
                        pathLength={1}
                        className="[stroke-dasharray:1] animate-[draw-check_450ms_150ms_ease-out_backwards]"
                      />
                    </svg>
                  </span>
                )}
                {n.href ? (
                  <a href={n.href} onClick={() => onDismiss(n.id)} className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-slate-600">{n.body}</span>}
                    <span className="mt-1 block text-xs font-medium text-teal-700 group-hover:underline">View</span>
                  </a>
                ) : (
                  <p className="min-w-0 flex-1 self-center text-sm font-semibold text-slate-900">{n.title}</p>
                )}
                <button
                  type="button"
                  onClick={() => onDismiss(n.id)}
                  aria-label="Dismiss"
                  className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:rotate-90 hover:bg-slate-100 hover:text-slate-700"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
                {/* Time left before it closes by itself. */}
                <span
                  aria-hidden="true"
                  style={{ animationDuration: `${TOAST_MS}ms` }}
                  className={`absolute inset-x-0 bottom-0 h-0.5 origin-left animate-toast-progress group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] motion-reduce:hidden ${
                    n.kind === "notification" ? "bg-teal-500/70" : "bg-emerald-500/70"
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Sound on/off for this browser. */
function SoundToggle() {
  const muted = useSyncExternalStore(subscribeSoundMuted, isSoundMuted, () => false);
  return (
    <button
      type="button"
      onClick={() => {
        setSoundMuted(!muted);
        if (muted) playChime(); // preview when turning it back on
      }}
      aria-pressed={!muted}
      title={muted ? "Turn notification sound on" : "Turn notification sound off"}
      className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
    >
      <span className="sr-only">{muted ? "Sound off" : "Sound on"}</span>
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
        {muted ? <path d="m16 9.5 5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
      </svg>
    </button>
  );
}

/** Bell button with unread badge and a dropdown of the latest notifications. */
export function NotificationBell({ align = "right" }: { align?: "left" | "right" }) {
  const ctx = useContext(NotificationsContext);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ctx) return null;
  const { unread, items, href, refresh, markAll, pending, ring } = ctx;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) refresh();
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`relative grid size-10 place-items-center rounded-lg hover:bg-slate-100 hover:text-slate-900 active:scale-95 ${
          open ? "bg-slate-100 text-slate-900" : "text-slate-600"
        }`}
      >
        <span className="sr-only">{unread ? `Notifications, ${unread} unread` : "Notifications"}</span>
        {/* Re-keyed on each arrival so the swing replays. */}
        <BellIcon key={ring} className={`size-5 origin-top ${ring ? "animate-bell-ring" : ""}`} />
        {unread > 0 && (
          <span aria-hidden="true" className="absolute top-1 right-1">
            {ring > 0 && <span key={`halo-${ring}`} className="absolute inset-0 animate-halo rounded-full bg-red-500" />}
            <span
              key={unread}
              className="relative grid h-4 min-w-4 animate-badge-pop place-items-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-bold text-white tabular-nums ring-2 ring-white"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={`absolute z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-pop-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 ${
            align === "left" ? "left-0 origin-top-left" : "right-0 origin-top-right"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="font-semibold text-slate-900">Notifications</p>
            <div className="flex items-center gap-1">
              <SoundToggle />
              <button
                type="button"
                onClick={markAll}
                disabled={pending || unread === 0}
                className="text-xs font-medium text-teal-700 hover:underline disabled:text-slate-400 disabled:no-underline"
              >
                Mark all as read
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items === null ? (
              <p className="p-6 text-center text-sm text-slate-500">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n, i) => (
                  <li key={n.id} className="animate-fade-down" style={{ animationDelay: `${Math.min(i, 7) * 35}ms` }}>
                    <NotificationLink n={n} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            href={href}
            onClick={() => setOpen(false)}
            className="block border-t border-slate-200 px-4 py-3 text-center text-sm font-medium text-teal-700 hover:bg-slate-50"
          >
            See all &amp; SMS settings
          </Link>
        </div>
      )}
    </div>
  );
}

export function NotificationLink({ n, onNavigate }: { n: AppNotification; onNavigate?: () => void }) {
  return (
    <a
      href={`/notifications/open/${n.id}`}
      onClick={onNavigate}
      className={`flex gap-3 px-4 py-3 transition-colors duration-500 hover:bg-slate-50 ${n.read_at ? "" : "bg-teal-50/50"}`}
    >
      <span
        className={`mt-1.5 size-2 shrink-0 rounded-full transition-[background-color,scale] duration-500 ${n.read_at ? "scale-0 bg-transparent" : "bg-teal-600"}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${n.read_at ? "text-slate-700" : "font-semibold text-slate-900"}`}>
          {n.title}
          {!n.read_at && <span className="sr-only"> (unread)</span>}
        </span>
        {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-slate-600">{n.body}</span>}
        <span className="mt-1 block text-xs text-slate-400">
          <TimeAgo iso={n.created_at} />
        </span>
      </span>
    </a>
  );
}

function TimeAgo({ iso }: { iso: string }) {
  const [label] = useState(() => relative(iso));
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label}
    </time>
  );
}

function relative(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}
