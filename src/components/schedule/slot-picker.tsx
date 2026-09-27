"use client";

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui/alert";
import { CONSULTATION_TYPE_LABEL } from "@/lib/schedule/constants";
import type { FormState } from "@/lib/validation/form-state";
import type { AvailableSlot, ConsultationType } from "@/types/database";

const noopSubscribe = () => () => {};

/** True only in the browser, so times render in the viewer's own time zone without hydration mismatch. */
function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

type SelectConfig = {
  /** Server action receiving hidden fields + slotStart + type. */
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  /** Button text prefix, e.g. "Book" -> "Book 10:30 AM". */
  verb: string;
};

type Props = {
  slots: AvailableSlot[];
  chamberNames: Record<string, string>;
  /** When set, slots are selectable and submit to the action. */
  select?: SelectConfig;
  note?: string;
  emptyText?: string;
};

export function SlotPicker({ slots, chamberNames, select, note, emptyText = "No available slots in the next few days." }: Props) {
  const isClient = useIsClient();
  const types = useMemo(() => [...new Set(slots.map((s) => s.consultation_type))] as ConsultationType[], [slots]);
  const [type, setType] = useState<ConsultationType | null>(null);
  const activeType = type && types.includes(type) ? type : (types[0] ?? null);

  const days = useMemo(() => {
    if (!isClient) return [];
    const dayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
    const map = new Map<string, AvailableSlot[]>();
    for (const s of slots) {
      if (activeType && s.consultation_type !== activeType) continue;
      const key = dayKey.format(new Date(s.slot_start));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [slots, activeType, isClient]);

  const [day, setDay] = useState<string | null>(null);
  const activeDay = days.find(([k]) => k === day)?.[0] ?? days[0]?.[0] ?? null;
  const daySlots = days.find(([k]) => k === activeDay)?.[1] ?? [];

  const [picked, setPicked] = useState<AvailableSlot | null>(null);
  const [state, formAction, pending] = useActionState(
    select?.action ?? (async (s: FormState) => s),
    undefined,
  );

  if (slots.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{emptyText}</p>;
  }
  if (!isClient) {
    return <div className="h-40 animate-pulse rounded-lg bg-slate-100" aria-label="Loading available slots" />;
  }

  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const tabFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const pickedVisible = picked && daySlots.some((s) => s.slot_start === picked.slot_start && s.consultation_type === picked.consultation_type);

  return (
    <div className="flex flex-col gap-4">
      {types.length > 1 && (
        <div role="tablist" aria-label="Consultation type" className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === activeType}
              onClick={() => {
                setType(t);
                setDay(null);
                setPicked(null);
              }}
              className={`h-9 rounded-md text-sm font-medium ${t === activeType ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
            >
              {CONSULTATION_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      <div role="tablist" aria-label="Day" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map(([key, list]) => {
          const selected = key === activeDay;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setDay(key);
                setPicked(null);
              }}
              className={`flex min-w-20 shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-xs ${
                selected ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 text-slate-700 hover:border-teal-400"
              }`}
            >
              <span className="font-semibold">{tabFmt.format(new Date(list[0].slot_start))}</span>
              <span className={selected ? "text-teal-50" : "text-slate-500"}>{list.length} slots</span>
            </button>
          );
        })}
      </div>

      <ul className="grid grid-cols-3 gap-2" aria-label="Available times">
        {daySlots.map((s) => {
          const label = timeFmt.format(new Date(s.slot_start));
          const isPicked = picked?.slot_start === s.slot_start && picked.consultation_type === s.consultation_type;
          return (
            <li key={`${s.slot_start}-${s.consultation_type}`}>
              {select ? (
                <button
                  type="button"
                  aria-pressed={isPicked}
                  onClick={() => setPicked(s)}
                  className={`w-full rounded-lg border py-2 text-center text-sm font-medium ${
                    isPicked
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-slate-200 text-slate-800 hover:border-teal-400 hover:bg-teal-50"
                  }`}
                >
                  {label}
                </button>
              ) : (
                <span className="block rounded-lg border border-slate-200 py-2 text-center text-sm font-medium text-slate-800">
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {activeType === "in_person" && daySlots[0]?.chamber_id && (
        <p className="text-xs text-slate-600">
          At{" "}
          {[...new Set(daySlots.map((s) => (s.chamber_id ? chamberNames[s.chamber_id] : null)).filter(Boolean))].join(", ")}
        </p>
      )}
      <p className="text-xs text-slate-500">
        Times shown in your time zone ({zone}). {daySlots[0]?.consultation_minutes ?? 20}-minute consultation.
      </p>

      {select && (
        <form action={formAction} className="flex flex-col gap-2">
          {Object.entries(select.hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {pickedVisible && (
            <>
              <input type="hidden" name="slotStart" value={picked.slot_start} />
              <input type="hidden" name="type" value={picked.consultation_type} />
            </>
          )}
          {state?.error && <Alert>{state.error}</Alert>}
          {state?.message && <Alert kind="success">{state.message}</Alert>}
          <button
            type="submit"
            disabled={!pickedVisible || pending}
            className="h-11 rounded-lg bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-teal-700/50"
          >
            {pending
              ? "Please wait…"
              : pickedVisible
                ? `${select.verb} ${tabFmt.format(new Date(picked.slot_start))}, ${timeFmt.format(new Date(picked.slot_start))}`
                : "Choose a time"}
          </button>
        </form>
      )}

      {note && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{note}</p>}
    </div>
  );
}
