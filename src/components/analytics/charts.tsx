"use client";

import { useEffect, useRef, useState } from "react";

// Hand-built, dependency-free charts following the house dataviz rules:
// thin marks, 2px lines, 4px rounded bar ends, hairline grid, one y-axis,
// legend for 2+ series, text in ink colours (never the series colour),
// hover/focus tooltips, and a table view where colour contrast is low.

export const SERIES = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
} as const;

const GRID = "#e2e8f0"; // slate-200, one step off the surface
const INK_MUTED = "#64748b"; // slate-500

export type Point = { key: string; label: string; long: string; values: number[] };
export type Series = { name: string; color: string };

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Clean axis maximum and ticks (0, 5, 10… / 0, 1K, 2K…). */
function niceScale(max: number, count = 4): { max: number; ticks: number[] } {
  if (max <= 0) return { max: count, ticks: Array.from({ length: count + 1 }, (_, i) => i) };
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { max: top, ticks };
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export function formatCompact(n: number): string {
  return Math.abs(n) < 1000 ? n.toLocaleString("en", { maximumFractionDigits: 1 }) : compact.format(n);
}

/** Show at most `n` evenly spaced x labels. */
function labelEvery(count: number, n: number) {
  return Math.max(1, Math.ceil(count / n));
}

function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: { color?: string; name: string; value: string }[] }) {
  const w = 190;
  // Beside the crosshair (right if it fits, else left) so it never hides the marks.
  const left = x + 14 + w <= width ? x + 14 : Math.max(0, x - 14 - w);
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 animate-fade-in rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
      style={{ left, width: w }}
    >
      <p className="mb-1 font-medium text-slate-500">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2 py-0.5">
          {r.color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" />}
          <span className="font-semibold text-slate-900 tabular-nums">{r.value}</span>
          <span className="truncate text-slate-500">{r.name}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items, shape = "line" }: { items: Series[]; shape?: "line" | "rect" }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={shape === "line" ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-sm"}
            style={{ background: s.color }}
          />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Line chart with crosshair (change over time, same unit, 2–3 series)
// -----------------------------------------------------------------------------
export function LineChart({
  points,
  series,
  height = 240,
  format = formatCompact,
  label,
}: {
  points: Point[];
  series: Series[];
  height?: number;
  format?: (n: number) => string;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const m = { top: 12, right: 92, bottom: 26, left: 40 };
  const w = Math.max(0, width - m.left - m.right);
  const h = height - m.top - m.bottom;
  const { max, ticks } = niceScale(Math.max(0, ...points.flatMap((p) => p.values)));
  const x = (i: number) => m.left + (points.length <= 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => m.top + h - (v / max) * h;
  const every = labelEvery(points.length, Math.max(2, Math.floor(w / 70)));

  // End labels only where they don't collide (legend + tooltip carry the rest).
  const last = points.length - 1;
  const ends = series
    .map((s, si) => ({ s, si, v: points[last]?.values[si] ?? 0 }))
    .sort((a, b) => y(a.v) - y(b.v));
  const shown = new Set<number>();
  let lastY = -Infinity;
  for (const e of ends) {
    if (y(e.v) - lastY >= 14) {
      shown.add(e.si);
      lastY = y(e.v);
    }
  }

  function pick(clientX: number, rect: DOMRect) {
    if (!points.length) return;
    const rel = clientX - rect.left - m.left;
    const i = Math.round((rel / Math.max(w, 1)) * (points.length - 1));
    setActive(Math.min(Math.max(i, 0), last));
  }

  return (
    <div
      ref={ref}
      className="relative outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
      tabIndex={0}
      role="img"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") setActive((a) => Math.min((a ?? -1) + 1, last));
        if (e.key === "ArrowLeft") setActive((a) => Math.max((a ?? last + 1) - 1, 0));
        if (e.key === "Escape") setActive(null);
      }}
      onBlur={() => setActive(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK_MUTED} className="tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            (i % every === 0 && last - i >= every) || i === last ? (
              <text key={p.key} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} fontSize={11} fill={INK_MUTED}>
                {p.label}
              </text>
            ) : null,
          )}
          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + h} stroke="#94a3b8" strokeWidth={1} shapeRendering="crispEdges" />
          )}
          {series.map((s, si) => (
            <path
              key={s.name}
              d={points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.values[si]).toFixed(1)}`).join("")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength={1}
              className="chart-draw"
            />
          ))}
          {series.map((s, si) => {
            const i = active ?? last;
            const p = points[i];
            if (!p) return null;
            return (
              <g key={s.name}>
                <circle cx={x(i)} cy={y(p.values[si])} r={4} fill={s.color} stroke="#fff" strokeWidth={2} className="transition-[cx,cy] duration-150" />
                {active === null && shown.has(si) && (
                  <text x={x(i) + 10} y={y(p.values[si])} dy="0.32em" fontSize={11} fill="#334155">
                    <tspan fontWeight={600}>{format(p.values[si])}</tspan> <tspan fill={INK_MUTED}>{s.name}</tspan>
                  </text>
                )}
              </g>
            );
          })}
          <rect
            x={m.left - 6}
            y={m.top}
            width={w + 12}
            height={h}
            fill="transparent"
            onPointerMove={(e) => pick(e.clientX, (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect())}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
      )}
      {active !== null && points[active] && (
        <Tooltip
          x={x(active)}
          width={width}
          title={points[active].long}
          rows={series.map((s, si) => ({ color: s.color, name: s.name, value: format(points[active].values[si]) }))}
        />
      )}
      {width === 0 && <div style={{ height }} />}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Column chart (one series; extra values in the tooltip)
// -----------------------------------------------------------------------------
export function ColumnChart({
  points,
  color,
  name,
  extras = [],
  height = 220,
  format = formatCompact,
  label,
}: {
  points: Point[];
  color: string;
  name: string;
  /** Names for values[1..] shown only in the tooltip. */
  extras?: string[];
  height?: number;
  format?: (n: number) => string;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const m = { top: 12, right: 8, bottom: 26, left: 44 };
  const w = Math.max(0, width - m.left - m.right);
  const h = height - m.top - m.bottom;
  const { max, ticks } = niceScale(Math.max(0, ...points.map((p) => p.values[0])));
  const band = points.length ? w / points.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2, band * 0.7));
  const y = (v: number) => m.top + h - (v / max) * h;
  const every = labelEvery(points.length, Math.max(2, Math.floor(w / 70)));
  const last = points.length - 1;

  return (
    <div
      ref={ref}
      className="relative outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
      tabIndex={0}
      role="img"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") setActive((a) => Math.min((a ?? -1) + 1, last));
        if (e.key === "ArrowLeft") setActive((a) => Math.max((a ?? last + 1) - 1, 0));
        if (e.key === "Escape") setActive(null);
      }}
      onBlur={() => setActive(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK_MUTED} className="tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const cx = m.left + band * i + band / 2;
            const v = p.values[0];
            const top = y(v);
            const bh = m.top + h - top;
            const r = Math.min(4, bh, barW / 2);
            const x0 = cx - barW / 2;
            // Rounded data end, square baseline.
            const d =
              bh <= 0
                ? ""
                : `M${x0},${m.top + h}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${m.top + h}Z`;
            return (
              <g key={p.key}>
                {d && (
                  <path
                    d={d}
                    fill={color}
                    opacity={active === null || active === i ? 1 : 0.45}
                    className="chart-grow transition-opacity duration-150"
                    style={{ animationDelay: `${Math.min(i, 40) * 8}ms` }}
                  />
                )}
                <rect
                  x={m.left + band * i}
                  y={m.top}
                  width={band}
                  height={h}
                  fill="transparent"
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                />
                {((i % every === 0 && last - i >= every) || i === last) && (
                  <text x={cx} y={height - 6} textAnchor={i === last ? "end" : i === 0 ? "start" : "middle"} fontSize={11} fill={INK_MUTED}>
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {active !== null && points[active] && (
        <Tooltip
          x={m.left + band * active + band / 2}
          width={width}
          title={points[active].long}
          rows={[name, ...extras].map((n, vi) => ({ color: vi === 0 ? color : undefined, name: n, value: format(points[active].values[vi] ?? 0) }))}
        />
      )}
      {width === 0 && <div style={{ height }} />}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Horizontal bars (ranked categories, one series) — HTML so labels wrap
// -----------------------------------------------------------------------------
export function HBarList({
  rows,
  color,
  format = formatCompact,
}: {
  rows: { label: string; value: number; detail?: string }[];
  color: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <li key={r.label} className="group grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-3 text-sm" title={r.detail}>
          <span className="truncate text-slate-700">{r.label}</span>
          <span className="flex items-center gap-2">
            <span
              className="chart-grow-x h-4 rounded-r-[4px] transition-opacity group-hover:opacity-80"
              style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, maxWidth: "calc(100% - 3rem)", background: color, animationDelay: `${i * 40}ms` }}
            />
            <span className="shrink-0 font-semibold text-slate-900 tabular-nums">{format(r.value)}</span>
          </span>
          {r.detail && <span className="col-start-2 -mt-1.5 text-xs text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">{r.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Split bar (parts of a whole, 2–3 parts) with a legend that carries the values
// -----------------------------------------------------------------------------
export function SplitBar({ parts }: { parts: { name: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded-[4px] bg-slate-100">
        {total > 0 &&
          visible.map((p) => (
            <span
              key={p.name}
              title={`${p.name}: ${p.value.toLocaleString()} (${Math.round((p.value / total) * 100)}%)`}
              className="chart-grow-x h-full transition-opacity hover:opacity-80"
              style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
            />
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {parts.map((p) => (
          <li key={p.name} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
            <span className="font-semibold text-slate-900 tabular-nums">{p.value.toLocaleString()}</span>
            {p.name}
            {total > 0 && <span className="text-slate-400">{Math.round((p.value / total) * 100)}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
