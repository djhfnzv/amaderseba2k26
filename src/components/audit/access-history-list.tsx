"use client";

import { useEffect, useRef, useState } from "react";
import { LocalTime } from "@/components/ui/local-time";
import { actionLabel } from "@/lib/audit/constants";
import type { RecordAccessRow } from "@/types/database";

type Feed = { rows: RecordAccessRow[]; total: number; page: number; pages: number };

const LIVE_EVERY_MS = 15_000;
const keyOf = (r: RecordAccessRow) => `${r.occurred_at}|${r.action}|${r.actor_label}`;

/** Patient's access history: pages load as JSON, new entries appear live. */
export function AccessHistoryList({ initial }: { initial: Feed }) {
  const [feed, setFeed] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [generation, setGeneration] = useState(0);
  const busy = useRef(false);

  async function load(page: number) {
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/patient/access-history?page=${page}`);
      if (!res.ok) throw new Error("Couldn't load your access history.");
      setFeed((await res.json()) as Feed);
      setFresh(new Set());
      setGeneration((g) => g + 1);
      window.history.replaceState(null, "", page > 1 ? `/patient/access-history?page=${page}` : "/patient/access-history");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  // New entries on the first page, every 15 s while the tab is visible.
  const newest = feed.rows[0]?.occurred_at ?? "";
  useEffect(() => {
    if (feed.page !== 1) return;
    const timer = setInterval(async () => {
      if (document.hidden || busy.current) return;
      try {
        const res = await fetch("/api/patient/access-history?page=1");
        if (!res.ok) return;
        const data = (await res.json()) as Feed;
        const added = data.rows.filter((r) => !newest || r.occurred_at > newest);
        if (!added.length) return;
        setFeed(data);
        setFresh((prev) => new Set([...prev, ...added.map(keyOf)]));
      } catch {
        /* offline — try again next tick */
      }
    }, LIVE_EVERY_MS);
    return () => clearInterval(timer);
  }, [feed.page, newest]);

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <span className="size-2 animate-live-dot rounded-full bg-emerald-500" aria-hidden="true" />
        Updates automatically
      </p>

      {error && <p role="alert" className="animate-fade-in rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {feed.rows.length === 0 ? (
        <p className="animate-fade-up rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          Nobody else has opened your records yet.
        </p>
      ) : (
        <ol
          aria-live="polite"
          className={`divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white transition-opacity duration-200 ${
            loading ? "opacity-60" : "opacity-100"
          }`}
        >
          {feed.rows.map((r, i) => {
            const isFresh = fresh.has(keyOf(r));
            return (
              <li
                key={`${generation}-${keyOf(r)}-${i}`}
                style={{ animationDelay: `${isFresh ? 0 : Math.min(i, 12) * 25}ms` }}
                className="relative flex animate-row-in flex-col gap-0.5 p-4 sm:flex-row sm:items-center sm:gap-4"
              >
                {isFresh && <span className="pointer-events-none absolute inset-0 animate-row-glow" aria-hidden="true" />}
                <span className="relative w-48 shrink-0 text-sm text-slate-500">
                  <LocalTime iso={r.occurred_at} />
                </span>
                <span className="relative min-w-0 flex-1 text-sm text-slate-900">
                  <strong className="font-semibold">{r.actor_label}</strong>
                  <span className="text-slate-600"> — {actionLabel(r.action).toLowerCase()}</span>
                  {isFresh && (
                    <span className="ml-2 animate-badge-pop rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold text-white">NEW</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {feed.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => void load(feed.page - 1)}
            disabled={feed.page <= 1 || loading}
            className="rounded-md px-2 py-1 font-medium text-teal-700 transition-colors hover:bg-teal-50 disabled:invisible"
          >
            ← Newer
          </button>
          <span className="text-slate-600">
            Page {feed.page} of {feed.pages}
          </span>
          <button
            type="button"
            onClick={() => void load(feed.page + 1)}
            disabled={feed.page >= feed.pages || loading}
            className="rounded-md px-2 py-1 font-medium text-teal-700 transition-colors hover:bg-teal-50 disabled:invisible"
          >
            Older →
          </button>
        </nav>
      )}
    </div>
  );
}
