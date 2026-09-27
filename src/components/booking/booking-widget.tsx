"use client";

import { useRef, useState } from "react";
import { SlotPicker } from "@/components/schedule/slot-picker";
import { startBooking } from "@/lib/appointments/actions";
import { BOOKING_WINDOW_DAYS } from "@/lib/schedule/constants";
import type { AvailableSlot, ConsultationType } from "@/types/database";

type Option = {
  type: ConsultationType;
  label: string;
  detail: string;
  fee: string;
};

const WEEKS = Math.ceil(BOOKING_WINDOW_DAYS / 7);

/** "2026-10-01" + n days (calendar math in UTC so no DST surprises). */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function rangeLabel(from: string): string {
  const fmt = (ymd: string) =>
    new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(from)} – ${fmt(addDays(from, 6))}`;
}

/**
 * Booking in steps: 1) choose online or in-person, 2) slots for that type load
 * (JSON from /api/doctors/:id/slots) week by week, 3) pick a time and book.
 */
export function BookingWidget({
  doctorId,
  slug,
  today,
  options,
  chamberNames,
  initialSlots,
}: {
  doctorId: string;
  slug: string;
  /** Today in the doctor's time zone (YYYY-MM-DD). */
  today: string;
  options: Option[];
  chamberNames: Record<string, string>;
  /** First week's free slots (all types), rendered by the server. */
  initialSlots: AvailableSlot[];
}) {
  const firstWeek = (t: ConsultationType) => initialSlots.filter((s) => s.consultation_type === t);
  const single = options.length === 1 ? options[0].type : null;
  const [type, setType] = useState<ConsultationType | null>(single);
  const [week, setWeek] = useState(0);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(single ? firstWeek(single) : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, AvailableSlot[]>());
  const abortRef = useRef<AbortController | null>(null);

  async function load(t: ConsultationType, w: number) {
    const from = addDays(today, w * 7);
    const key = `${t}:${from}`;
    setError(null);
    const cached = w === 0 ? firstWeek(t) : cache.current.get(key);
    if (cached) {
      abortRef.current?.abort();
      setLoading(false);
      setSlots(cached);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setSlots(null);
    try {
      const res = await fetch(`/api/doctors/${doctorId}/slots?type=${t}&from=${from}&days=7`, { signal: controller.signal });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { slots: AvailableSlot[] };
      cache.current.set(key, json.slots);
      setSlots(json.slots);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Couldn't load available times. Please try again.");
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  function choose(t: ConsultationType) {
    setType(t);
    setWeek(0);
    void load(t, 0);
  }

  function goWeek(w: number) {
    if (!type) return;
    setWeek(w);
    void load(type, w);
  }

  if (options.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">This doctor isn&apos;t taking bookings yet.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Step 1 */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-900">1. How would you like to consult?</legend>
        <div className="grid gap-2">
          {options.map((o) => {
            const on = type === o.type;
            return (
              <button
                key={o.type}
                type="button"
                aria-pressed={on}
                onClick={() => choose(o.type)}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                  on ? "border-teal-700 bg-teal-50 ring-1 ring-teal-700" : "border-slate-200 hover:border-teal-400 hover:bg-slate-50"
                }`}
              >
                <span className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 ${
                      on ? "border-teal-700" : "border-slate-300"
                    }`}
                  >
                    {on && <span className="size-2.5 rounded-full bg-teal-700" />}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                    <span className="block text-xs text-slate-600">{o.detail}</span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold text-slate-900">{o.fee}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Steps 2 & 3 */}
      {type && (
        <div className="flex animate-fade-down flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">2. Pick a day & time</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goWeek(week - 1)}
                disabled={week === 0 || loading}
                aria-label="Previous week"
                className="grid size-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              >
                ‹
              </button>
              <span className="min-w-28 text-center text-xs text-slate-600">{rangeLabel(addDays(today, week * 7))}</span>
              <button
                type="button"
                onClick={() => goWeek(week + 1)}
                disabled={week >= WEEKS - 1 || loading}
                aria-label="Next week"
                className="grid size-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}{" "}
              <button type="button" onClick={() => load(type, week)} className="font-semibold underline">
                Retry
              </button>
            </p>
          )}

          {loading || slots === null ? (
            !error && (
              <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading available times">
                <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-28 animate-pulse rounded-lg bg-slate-100" />
              </div>
            )
          ) : slots.length === 0 ? (
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              No free times this week.
              {week < WEEKS - 1 && (
                <button type="button" onClick={() => goWeek(week + 1)} className="ml-1 font-semibold text-teal-700 underline">
                  Check next week
                </button>
              )}
            </div>
          ) : (
            <SlotPicker
              key={`${type}-${week}`}
              slots={slots}
              chamberNames={chamberNames}
              select={{ action: startBooking, hidden: { doctorId, slug }, verb: "Book" }}
            />
          )}
        </div>
      )}
    </div>
  );
}
