"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditFeed } from "@/app/api/admin/audit/route";
import { LocalTime } from "@/components/ui/local-time";
import {
  ACTION_OPTIONS,
  AUDIT_CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_TONE,
  actionLabel,
  shortUserAgent,
} from "@/lib/audit/constants";
import { auditUrl, type AuditFilters } from "@/lib/audit/filters";
import type { AuditLog } from "@/types/database";

const LIVE_EVERY_MS = 8000;
const MAX_ROWS = 150;
const EMPTY: AuditFilters = { q: "", actor: "", patient: "", category: "", action: "", outcome: "", from: "", to: "", page: 1 };

/** /api/admin/audit?<filters>[&after=<id>] */
function feedUrl(f: AuditFilters, after?: number): string {
  const qs = new URLSearchParams(auditUrl(f, "").slice(1));
  if (after) qs.set("after", String(after));
  return `/api/admin/audit?${qs}`;
}

const input =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-shadow focus:ring-2 focus:ring-teal-600";

/**
 * Admin audit log: filters and paging load JSON without a page reload, and
 * new entries stream in every few seconds on the first page.
 */
export function AuditExplorer({ initial, initialFilters }: { initial: AuditFeed; initialFilters: AuditFilters }) {
  const [feed, setFeed] = useState(initial);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [formKey, setFormKey] = useState(0);
  // Bumped on every full load so rows replay their entrance animation.
  const [generation, setGeneration] = useState(0);
  const request = useRef<AbortController | null>(null);

  const canStream = live && filters.page === 1 && !filters.to;

  const load = useCallback(async (next: AuditFilters) => {
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(feedUrl(next), { signal: ctrl.signal });
      if (!res.ok) throw new Error(res.status === 403 ? "Your session has ended. Please log in again." : "Couldn't load entries.");
      const data = (await res.json()) as AuditFeed;
      setFeed(data);
      setFilters(next);
      setFresh(new Set());
      setGeneration((g) => g + 1);
      window.history.replaceState(null, "", auditUrl(next));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  // Live updates: ask only for entries newer than the top one.
  const newestId = feed.rows[0]?.id ?? 0;
  useEffect(() => {
    if (!canStream) return;
    const timer = setInterval(async () => {
      if (document.hidden || request.current) return;
      try {
        const res = await fetch(feedUrl({ ...filters, page: 1 }, newestId));
        if (!res.ok) return;
        const data = (await res.json()) as AuditFeed;
        if (!data.rows.length) return;
        setFeed((prev) => {
          const seen = new Set(prev.rows.map((r) => r.id));
          const added = data.rows.filter((r) => !seen.has(r.id));
          const total = prev.total + added.length;
          return {
            ...prev,
            rows: [...added, ...prev.rows].slice(0, MAX_ROWS),
            total,
            pages: Math.max(prev.pages, Math.ceil(total / 50)),
            patients: { ...prev.patients, ...data.patients },
          };
        });
        setFresh((prev) => new Set([...prev, ...data.rows.map((r) => r.id)]));
      } catch {
        /* offline — try again next tick */
      }
    }, LIVE_EVERY_MS);
    return () => clearInterval(timer);
  }, [canStream, filters, newestId]);

  // Clear the in-flight marker so polling resumes after a load.
  useEffect(() => {
    if (!loading) request.current = null;
  }, [loading]);

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    void load({
      ...filters,
      q: s("q"),
      category: s("category") as AuditFilters["category"],
      action: s("action"),
      from: s("from"),
      to: s("to"),
      outcome: fd.get("outcome") === "failed" ? "failed" : "",
      page: 1,
    });
  }

  const filtered = Object.entries(filters).some(([k, v]) => k !== "page" && v !== "");

  return (
    <div className="flex flex-col gap-5">
      <form
        key={formKey}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
        className="grid animate-fade-up gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 @4xl:grid-cols-4"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
          Search
          <input name="q" type="search" defaultValue={filters.q} placeholder="Name, email or IP address" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Category
          <select
            name="category"
            defaultValue={filters.category}
            onChange={(e) => submit(e.currentTarget.form!)}
            className={input}
          >
            <option value="">All categories</option>
            {AUDIT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Action
          <select name="action" defaultValue={filters.action} onChange={(e) => submit(e.currentTarget.form!)} className={input}>
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          From (BD time)
          <input name="from" type="date" defaultValue={filters.from} onChange={(e) => submit(e.currentTarget.form!)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          To
          <input name="to" type="date" defaultValue={filters.to} onChange={(e) => submit(e.currentTarget.form!)} className={input} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-800">
          <input
            type="checkbox"
            name="outcome"
            value="failed"
            defaultChecked={filters.outcome === "failed"}
            onChange={(e) => submit(e.currentTarget.form!)}
            className="size-4 accent-teal-700"
          />
          Failed only
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="h-10 flex-1 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white transition-[background-color,scale] hover:bg-teal-800 active:scale-[0.98]"
          >
            Search
          </button>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setFormKey((k) => k + 1);
                void load(EMPTY);
              }}
              className="h-10 animate-fade-in rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {(filters.actor || filters.patient) && (
        <div className="flex animate-fade-in flex-wrap gap-2 text-sm">
          {filters.actor && (
            <Chip onRemove={() => void load({ ...filters, actor: "", page: 1 })}>
              Activity by <strong>{feed.actorName ?? "a deleted user"}</strong>
            </Chip>
          )}
          {filters.patient && (
            <Chip onRemove={() => void load({ ...filters, patient: "", page: 1 })}>
              Access to <strong>{feed.patientName ?? "a deleted patient"}</strong>&apos;s data
            </Chip>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-slate-600" aria-live="polite">
          <span key={feed.total} className="inline-block animate-pop-in font-semibold text-slate-900 tabular-nums">
            {feed.total.toLocaleString()}
          </span>{" "}
          entr{feed.total === 1 ? "y" : "ies"}
          {loading && <span className="ml-2 text-slate-400">Loading…</span>}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            aria-pressed={live}
            title={filters.page !== 1 || filters.to ? "Live updates run on the first page without an end date" : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              canStream ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            <span className={`size-2 rounded-full ${canStream ? "animate-live-dot bg-emerald-500" : "bg-slate-300"}`} aria-hidden="true" />
            {canStream ? "Live" : live ? "Live (first page only)" : "Paused"}
          </button>
          <a
            href={auditUrl({ ...filters, page: 1 }, "/admin/audit/export")}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
          >
            Export CSV
          </a>
        </div>
      </div>

      {error && <p role="alert" className="animate-fade-in rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="relative">
        {loading && (
          <div className="absolute inset-x-0 -top-1 z-10 h-0.5 overflow-hidden rounded-full bg-teal-100" aria-hidden="true">
            <div className="h-full w-1/3 animate-loading-bar bg-teal-600" />
          </div>
        )}
        {feed.rows.length === 0 ? (
          <p className="animate-fade-in rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            No entries match these filters.
          </p>
        ) : (
          <ol
            className={`divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white transition-opacity duration-200 ${
              loading ? "opacity-60" : "opacity-100"
            }`}
          >
            {feed.rows.map((r, i) => (
              <Row
                key={`${generation}-${r.id}`}
                row={r}
                patientName={r.patient_id ? feed.patients[r.patient_id] : undefined}
                fresh={fresh.has(r.id)}
                delay={fresh.has(r.id) ? 0 : Math.min(i, 12) * 22}
                onActor={(id) => void load({ ...EMPTY, actor: id })}
                onPatient={(id) => void load({ ...EMPTY, patient: id })}
              />
            ))}
          </ol>
        )}
      </div>

      {feed.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          <PageButton disabled={filters.page <= 1 || loading} onClick={() => void load({ ...filters, page: filters.page - 1 })}>
            ← Newer
          </PageButton>
          <span className="text-slate-600">
            Page {filters.page} of {feed.pages}
          </span>
          <PageButton disabled={filters.page >= feed.pages || loading} onClick={() => void load({ ...filters, page: filters.page + 1 })}>
            Older →
          </PageButton>
        </nav>
      )}
    </div>
  );
}

function Row({
  row: r,
  patientName,
  fresh,
  delay,
  onActor,
  onPatient,
}: {
  row: AuditLog;
  patientName?: string;
  fresh: boolean;
  delay: number;
  onActor: (id: string) => void;
  onPatient: (id: string) => void;
}) {
  const meta = r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? r.metadata : {};
  const hasMeta = Object.keys(meta).length > 0;
  return (
    <li
      style={{ animationDelay: `${delay}ms` }}
      className="relative grid animate-row-in gap-2 p-4 text-sm transition-colors hover:bg-slate-50/70 @4xl:grid-cols-[10rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] @4xl:gap-4"
    >
      {fresh && <span className="pointer-events-none absolute inset-0 animate-row-glow" aria-hidden="true" />}
      <div className="relative text-slate-600">
        <LocalTime iso={r.occurred_at} className="font-medium text-slate-900" />
        {fresh && <span className="ml-2 animate-badge-pop rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold text-white">NEW</span>}
      </div>
      <div className="relative min-w-0">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${CATEGORY_TONE[r.category]}`}>{CATEGORY_LABEL[r.category]}</span>
          <span className="font-medium text-slate-900">{actionLabel(r.action)}</span>
          {!r.success && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">Failed</span>}
        </p>
        {(r.target_type || hasMeta) && (
          <details className="group mt-1 text-xs text-slate-500">
            <summary className="cursor-pointer list-none hover:text-slate-800">
              <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
              {r.target_type ?? "details"}
              {r.target_id ? ` · ${r.target_id}` : ""}
            </summary>
            {hasMeta && (
              <pre className="mt-1 animate-fade-down overflow-x-auto rounded-md bg-slate-50 p-2 break-all whitespace-pre-wrap text-slate-700">
                {JSON.stringify(meta, null, 2)}
              </pre>
            )}
          </details>
        )}
      </div>
      <div className="relative min-w-0">
        {r.actor_id ? (
          <button
            type="button"
            onClick={() => onActor(r.actor_id!)}
            title="Show only this person's activity"
            className="block max-w-full truncate text-left font-medium text-slate-900 hover:text-teal-700"
          >
            {r.actor_label ?? r.actor_id}
          </button>
        ) : (
          <span className="text-slate-600">{r.actor_role === "system" ? "System" : "Not signed in"}</span>
        )}
        <span className="text-xs text-slate-500">
          {r.actor_role && r.actor_role !== "system" && r.actor_role !== "anonymous" ? r.actor_role : ""}
        </span>
        {r.patient_id && r.patient_id !== r.actor_id && (
          <p className="truncate text-xs text-slate-600">
            Patient:{" "}
            <button
              type="button"
              onClick={() => onPatient(r.patient_id!)}
              title="Show everything about this patient's data"
              className="font-medium text-teal-700 hover:underline"
            >
              {patientName ?? "deleted account"}
            </button>
          </p>
        )}
      </div>
      <div className="relative min-w-0 text-xs text-slate-500">
        <p className="font-mono">{r.ip ?? "—"}</p>
        <p className="truncate" title={r.user_agent ?? undefined}>{shortUserAgent(r.user_agent)}</p>
      </div>
    </li>
  );
}

function Chip({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <span className="inline-flex animate-scale-in items-center gap-2 rounded-full bg-teal-50 py-1 pr-1 pl-3 text-teal-900">
      <span>{children}</span>
      <button type="button" onClick={onRemove} aria-label="Remove filter" className="grid size-6 place-items-center rounded-full hover:bg-teal-100">
        ✕
      </button>
    </span>
  );
}

function PageButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-2 py-1 font-medium text-teal-700 transition-colors hover:bg-teal-50 disabled:invisible"
    >
      {children}
    </button>
  );
}
