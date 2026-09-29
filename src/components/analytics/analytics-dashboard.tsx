"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ColumnChart, HBarList, Legend, LineChart, SERIES, SplitBar, formatCompact, type Point } from "@/components/analytics/charts";
import type { AnalyticsPair } from "@/lib/admin/analytics";
import type { Analytics, AnalyticsDay } from "@/types/database";

const PRESETS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

function shift(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const taka = (n: number) => `৳${formatCompact(n)}`;
const takaFull = (n: number) => `৳${Math.round(n).toLocaleString("en")}`;

const fmtDay = (ymd: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

type Bucket = { key: string; label: string; long: string; days: AnalyticsDay[] };

/** Daily up to ~2 months, then weekly, then monthly — bars stay readable. */
function bucketize(series: AnalyticsDay[]): Bucket[] {
  const n = series.length;
  if (n <= 62) {
    return series.map((d) => ({
      key: d.day,
      label: fmtDay(d.day, { day: "numeric", month: "short" }),
      long: fmtDay(d.day, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
      days: [d],
    }));
  }
  const monthly = n > 200;
  const map = new Map<string, Bucket>();
  for (const d of series) {
    let key: string;
    let label: string;
    let long: string;
    if (monthly) {
      key = d.day.slice(0, 7);
      label = fmtDay(`${key}-01`, { month: "short" });
      long = fmtDay(`${key}-01`, { month: "long", year: "numeric" });
    } else {
      const dow = (new Date(`${d.day}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday start
      key = shift(d.day, -dow);
      label = fmtDay(key, { day: "numeric", month: "short" });
      long = `Week of ${fmtDay(key, { day: "numeric", month: "short", year: "numeric" })}`;
    }
    const b = map.get(key) ?? { key, label, long, days: [] };
    b.days.push(d);
    map.set(key, b);
  }
  return [...map.values()];
}

function sum(b: Bucket, k: keyof Omit<AnalyticsDay, "day">) {
  return b.days.reduce((s, d) => s + Number(d[k]), 0);
}

export function AnalyticsDashboard({ initial, today }: { initial: AnalyticsPair; today: string }) {
  const [data, setData] = useState(initial);
  const [range, setRange] = useState({ from: initial.current.from, to: initial.current.to });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const request = useRef<AbortController | null>(null);

  async function load(from: string, to: string) {
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    setRange({ from, to });
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?from=${from}&to=${to}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error("Couldn't load analytics.");
      const next = (await res.json()) as AnalyticsPair;
      setData(next);
      setRange({ from: next.current.from, to: next.current.to });
      window.history.replaceState(null, "", `/admin/analytics?from=${next.current.from}&to=${next.current.to}`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  const cur = data.current;
  const prev = data.previous;
  const buckets = useMemo(() => bucketize(cur.series), [cur.series]);
  const activity: Point[] = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    long: b.long,
    values: [sum(b, "bookings"), sum(b, "completed"), sum(b, "cancelled")],
  }));
  const money: Point[] = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    long: b.long,
    values: [sum(b, "revenue"), sum(b, "commission"), sum(b, "refunds")],
  }));
  const grain = buckets.length === cur.series.length ? "day" : cur.series.length > 200 ? "month" : "week";
  const cancelRate = cur.visits.total ? cur.visits.cancelled / cur.visits.total : 0;
  const prevCancelRate = prev && prev.visits.total ? prev.visits.cancelled / prev.visits.total : null;
  const activePreset = PRESETS.find((p) => range.to === today && range.from === shift(today, -(p.days - 1)))?.days;

  return (
    <div className="flex flex-col gap-6">
      {/* Filters: one row, above everything they scope */}
      <div className="flex animate-fade-up flex-wrap items-end gap-3">
        <div role="group" aria-label="Date range" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              aria-pressed={activePreset === p.days}
              onClick={() => void load(shift(today, -(p.days - 1)), today)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activePreset === p.days ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void load(String(fd.get("from")), String(fd.get("to")));
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            From
            <input key={`f-${range.from}`} name="from" type="date" defaultValue={range.from} max={today} required className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            To
            <input key={`t-${range.to}`} name="to" type="date" defaultValue={range.to} max={today} required className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900" />
          </label>
          <button type="submit" className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            Apply
          </button>
        </form>
        <p className="text-xs text-slate-500 sm:ml-auto" aria-live="polite">
          {loading ? "Updating…" : `Bangladesh time · compared with the previous ${cur.series.length} days`}
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? "opacity-60" : "opacity-100"}`}>
        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          <Stat label="Bookings made" value={cur.bookings} prev={prev?.bookings} i={0} />
          <Stat label="Visits completed" value={cur.visits.completed} prev={prev?.visits.completed} i={1} />
          <Stat
            label="Cancellation rate"
            value={cancelRate}
            prev={prevCancelRate ?? undefined}
            display={`${Math.round(cancelRate * 100)}%`}
            upIsGood={false}
            sub={`${cur.visits.cancelled} of ${cur.visits.total} visits`}
            i={2}
          />
          <Stat label="Active doctors" value={cur.visits.active_doctors} prev={prev?.visits.active_doctors} sub={`${cur.verified_doctors} verified in total`} i={3} />
          <Stat label="Collected online" value={cur.money.gross} prev={prev?.money.gross} display={takaFull(cur.money.gross)} sub={`${cur.money.payments} payments`} i={4} />
          <Stat label="Platform commission" value={cur.money.commission} prev={prev?.money.commission} display={takaFull(cur.money.commission)} i={5} />
          <Stat label="Refunded" value={cur.money.refunds} prev={prev?.money.refunds} display={takaFull(cur.money.refunds)} upIsGood={false} i={6} />
          <Stat
            label="New sign-ups"
            value={cur.people.new_patients + cur.people.new_doctors}
            prev={prev ? prev.people.new_patients + prev.people.new_doctors : undefined}
            sub={`${cur.people.new_patients} patients · ${cur.people.new_doctors} doctors`}
            i={7}
          />
        </div>

        {/* Activity over time */}
        <Card
          title="Bookings, completed visits and cancellations"
          subtitle={`Per ${grain}. Bookings by booking date, visits by visit date, cancellations by cancel date.`}
          action={
            <button type="button" onClick={() => setShowTable((v) => !v)} className="text-sm font-medium text-teal-700 hover:underline">
              {showTable ? "Show chart" : "Show as table"}
            </button>
          }
        >
          {showTable ? (
            <DataTable buckets={buckets} />
          ) : (
            <>
              <Legend items={[{ name: "Bookings", color: SERIES.blue }, { name: "Completed", color: SERIES.orange }, { name: "Cancelled", color: SERIES.aqua }]} />
              <div className="mt-3">
                <LineChart
                  points={activity}
                  series={[{ name: "Bookings", color: SERIES.blue }, { name: "Completed", color: SERIES.orange }, { name: "Cancelled", color: SERIES.aqua }]}
                  label={`Bookings, completed visits and cancellations per ${grain}`}
                />
              </div>
            </>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card title="Money collected online" subtitle={`Per ${grain}. Hover a bar for commission and refunds.`}>
            <ColumnChart
              points={money}
              color={SERIES.blue}
              name="Collected"
              extras={["Commission", "Refunded"]}
              format={taka}
              label={`Money collected online per ${grain}`}
            />
          </Card>

          <Card title="Top specialties" subtitle="Visits in this period (not cancelled)">
            {cur.top_specialties.length ? (
              <HBarList
                color={SERIES.blue}
                rows={cur.top_specialties.map((s) => ({
                  label: s.name,
                  value: Number(s.visits),
                  detail: `${s.completed} completed · ${takaFull(Number(s.revenue))} collected`,
                }))}
              />
            ) : (
              <Empty />
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
          <Card title="Online vs in person" subtitle="Visits in this period (not cancelled)">
            <SplitBar
              parts={[
                { name: "Online", value: cur.visits.online, color: SERIES.blue },
                { name: "In person", value: cur.visits.in_person, color: SERIES.orange },
              ]}
            />
          </Card>
          <Card title="Who cancelled" subtitle={`${cur.visits.cancelled} cancelled visits · ${cur.visits.no_show} no-shows`}>
            <SplitBar
              parts={[
                { name: "Patient", value: cur.visits.by_patient, color: SERIES.blue },
                { name: "Doctor", value: cur.visits.by_doctor, color: SERIES.orange },
                { name: "Admin", value: cur.visits.by_admin, color: SERIES.aqua },
              ]}
            />
          </Card>
        </div>

        <Card title="Top doctors" subtitle="By completed visits in this period">
          {cur.top_doctors.length ? <TopDoctors rows={cur.top_doctors} /> : <Empty />}
        </Card>

        <p className="text-xs text-slate-500">
          Complaints in this period: {cur.complaints.filed} filed, {cur.complaints.closed} closed ·{" "}
          <Link href="/admin/complaints" className="font-medium text-teal-700 hover:underline">Open complaints →</Link>
        </p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
function Stat({
  label,
  value,
  prev,
  display,
  sub,
  upIsGood = true,
  i,
}: {
  label: string;
  value: number;
  prev?: number;
  display?: string;
  sub?: string;
  upIsGood?: boolean;
  i: number;
}) {
  const delta = prev === undefined ? null : prev === 0 ? (value === 0 ? 0 : null) : (value - prev) / prev;
  const good = delta === null || delta === 0 ? null : delta > 0 === upIsGood;
  return (
    <div
      style={{ animationDelay: `${i * 35}ms` }}
      className="animate-fade-up rounded-2xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm"
    >
      <p className="text-sm text-slate-600">{label}</p>
      <p key={display ?? value} className="mt-1 animate-pop-in text-2xl font-semibold text-slate-900">
        {display ?? value.toLocaleString("en")}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
        {delta !== null && (
          <span className={`font-semibold ${good === null ? "text-slate-500" : good ? "text-emerald-700" : "text-red-700"}`}>
            {delta === 0 ? "No change" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta * 100))}%`}
          </span>
        )}
        {sub && <span className="text-slate-500">{sub}</span>}
      </p>
    </div>
  );
}

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 animate-fade-up rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-slate-500">No visits in this period.</p>;
}

function DataTable({ buckets }: { buckets: Bucket[] }) {
  return (
    <div className="max-h-96 animate-fade-in overflow-auto rounded-xl border border-slate-200">
      <table className="w-full text-right text-sm tabular-nums">
        <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Period</th>
            <th className="px-3 py-2 font-semibold">Bookings</th>
            <th className="px-3 py-2 font-semibold">Completed</th>
            <th className="px-3 py-2 font-semibold">Cancelled</th>
            <th className="px-3 py-2 font-semibold">Collected</th>
            <th className="px-3 py-2 font-semibold">Commission</th>
            <th className="px-3 py-2 font-semibold">Refunded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {[...buckets].reverse().map((b) => (
            <tr key={b.key}>
              <td className="px-3 py-1.5 text-left text-slate-700">{b.long}</td>
              <td className="px-3 py-1.5">{sum(b, "bookings")}</td>
              <td className="px-3 py-1.5">{sum(b, "completed")}</td>
              <td className="px-3 py-1.5">{sum(b, "cancelled")}</td>
              <td className="px-3 py-1.5">{takaFull(sum(b, "revenue"))}</td>
              <td className="px-3 py-1.5">{takaFull(sum(b, "commission"))}</td>
              <td className="px-3 py-1.5">{takaFull(sum(b, "refunds"))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopDoctors({ rows }: { rows: Analytics["top_doctors"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="text-xs text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="py-2 pr-3 text-left font-semibold">Doctor</th>
            <th className="px-3 py-2 text-right font-semibold">Completed</th>
            <th className="px-3 py-2 text-right font-semibold">Visits</th>
            <th className="px-3 py-2 text-right font-semibold">Doctor cancelled</th>
            <th className="px-3 py-2 text-right font-semibold">Collected</th>
            <th className="py-2 pl-3 text-right font-semibold">Rating</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {rows.map((d, i) => (
            <tr key={d.id} style={{ animationDelay: `${i * 30}ms` }} className="animate-row-in transition-colors hover:bg-slate-50">
              <td className="py-2 pr-3">
                <Link href={`/admin/users/${d.id}`} className="font-medium text-slate-900 hover:text-teal-700">{d.name}</Link>
                {d.specialty && <span className="block text-xs text-slate-500">{d.specialty}</span>}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-slate-900">{d.completed}</td>
              <td className="px-3 py-2 text-right text-slate-700">{d.visits}</td>
              <td className={`px-3 py-2 text-right ${d.doctor_cancellations > 0 ? "text-red-700" : "text-slate-500"}`}>{d.doctor_cancellations}</td>
              <td className="px-3 py-2 text-right text-slate-700">{takaFull(Number(d.revenue))}</td>
              <td className="py-2 pl-3 text-right text-slate-700">
                {d.rating_avg != null && d.reviews >= 3 ? `★ ${Number(d.rating_avg).toFixed(1)}` : "—"}
                <span className="ml-1 text-xs text-slate-400">({d.reviews})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
