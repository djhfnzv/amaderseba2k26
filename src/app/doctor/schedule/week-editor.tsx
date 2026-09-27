"use client";

import { useActionState, useState } from "react";
import { addAvailability, copyDay, deleteAvailability, toggleAvailability, updateAvailability } from "./actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InlineAction } from "@/components/ui/inline-action";
import {
  CONSULTATION_TYPE_LABEL,
  DEFAULT_CONSULTATION_MINUTES,
  MAX_CONSULTATION_MINUTES,
  MIN_CONSULTATION_MINUTES,
  SLOT_INTERVAL_MINUTES,
  WEEKDAYS,
  formatClock,
  slotsInBlock,
  toMinutes,
} from "@/lib/schedule/constants";
import type { FormState } from "@/lib/validation/form-state";
import type { DoctorAvailability } from "@/types/database";

type Chamber = { id: string; name: string };

type Props = {
  blocks: DoctorAvailability[];
  chambers: Chamber[];
  offersOnline: boolean;
  offersInPerson: boolean;
};

/** Timeline range shown per day: 6 AM – midnight. */
const DAY_START = 6 * 60;
const DAY_END = 24 * 60;

const PRESETS = [
  { label: "Morning", start: "09:00", end: "13:00" },
  { label: "Afternoon", start: "14:00", end: "17:00" },
  { label: "Evening", start: "17:00", end: "21:00" },
];

type Open = { kind: "add"; weekday: number } | { kind: "edit"; id: string } | { kind: "copy"; weekday: number } | null;

export function WeekEditor({ blocks, chambers, offersOnline, offersInPerson }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  return (
    <div className="flex flex-col gap-3">
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Colour key">
      <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-amber-400" aria-hidden="true" />Online</li>
      <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-sky-500" aria-hidden="true" />In-person</li>
      <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-slate-300" aria-hidden="true" />Paused</li>
    </ul>
    <ul className="flex flex-col gap-3">
      {WEEKDAYS.map((day) => {
        const list = blocks.filter((b) => b.weekday === day.value).sort((a, b) => a.start_time.localeCompare(b.start_time));
        const daySlots = list.filter((b) => b.is_active).reduce((n, b) => n + slotsInBlock(b.start_time, b.end_time, b.consultation_minutes), 0);
        const isOpen = (kind: "add" | "copy") => open?.kind === kind && open.weekday === day.value;

        return (
          <li key={day.value} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4">
              <p className="w-24 shrink-0 font-semibold text-slate-900">{day.label}</p>
              <p className="flex-1 text-sm text-slate-500">
                {list.length === 0 ? "Off" : `${daySlots} slot${daySlots === 1 ? "" : "s"}`}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen("add") ? null : { kind: "add", weekday: day.value })}
                  className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50"
                >
                  + Add hours
                </button>
                {list.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen("copy") ? null : { kind: "copy", weekday: day.value })}
                    className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Copy to…
                  </button>
                )}
              </div>
            </div>

            <div className="px-4 pb-4 pt-3">
              <Timeline blocks={list} />

              {list.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {list.map((b) =>
                    open?.kind === "edit" && open.id === b.id ? (
                      <li key={b.id} className="animate-fade-down rounded-lg border border-teal-200 bg-teal-50/40 p-3">
                        <BlockForm
                          mode="edit"
                          block={b}
                          weekday={day.value}
                          chambers={chambers}
                          offersOnline={offersOnline}
                          offersInPerson={offersInPerson}
                          onDone={close}
                        />
                      </li>
                    ) : (
                      <BlockRow
                        key={b.id}
                        block={b}
                        chamberName={b.chamber_id ? chambers.find((c) => c.id === b.chamber_id)?.name : undefined}
                        dayLabel={day.label}
                        onEdit={() => setOpen({ kind: "edit", id: b.id })}
                      />
                    ),
                  )}
                </ul>
              )}

              {isOpen("add") && (
                <div className="mt-3 animate-fade-down rounded-lg border border-teal-200 bg-teal-50/40 p-3">
                  <BlockForm
                    mode="add"
                    weekday={day.value}
                    chambers={chambers}
                    offersOnline={offersOnline}
                    offersInPerson={offersInPerson}
                    onDone={close}
                  />
                </div>
              )}

              {isOpen("copy") && (
                <div className="mt-3 animate-fade-down rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <CopyDayForm from={day.value} fromLabel={day.label} onDone={close} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
    </div>
  );
}

/** Proportional bar of the day's blocks between 6 AM and midnight. */
function Timeline({ blocks }: { blocks: DoctorAvailability[] }) {
  const span = DAY_END - DAY_START;
  return (
    <div aria-hidden="true">
      <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
        {blocks.map((b) => {
          const start = Math.max(toMinutes(b.start_time), DAY_START);
          const end = Math.min(toMinutes(b.end_time), DAY_END);
          if (end <= start) return null;
          return (
            <span
              key={b.id}
              className={`absolute inset-y-0 animate-fade-in rounded-full transition-[left,width,background-color] duration-300 ${
                !b.is_active ? "bg-slate-300" : b.consultation_type === "online" ? "bg-amber-400" : "bg-sky-500"
              }`}
              style={{ left: `${((start - DAY_START) / span) * 100}%`, width: `${((end - start) / span) * 100}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>12 AM</span>
      </div>
    </div>
  );
}

function BlockRow({
  block,
  chamberName,
  dayLabel,
  onEdit,
}: {
  block: DoctorAvailability;
  chamberName?: string;
  dayLabel: string;
  onEdit: () => void;
}) {
  const count = slotsInBlock(block.start_time, block.end_time, block.consultation_minutes);
  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
        block.is_active ? "border-slate-200" : "border-dashed border-slate-300 bg-slate-50"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3 text-sm">
        <span
          aria-hidden="true"
          className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
            !block.is_active ? "bg-slate-300" : block.consultation_type === "online" ? "bg-amber-400" : "bg-sky-500"
          }`}
        />
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {formatClock(block.start_time)} – {formatClock(block.end_time)}
            {!block.is_active && <span className="ml-2 text-xs font-normal text-slate-500">(paused)</span>}
          </p>
          <p className="truncate text-slate-600">
            {CONSULTATION_TYPE_LABEL[block.consultation_type]}
            {chamberName && ` · ${chamberName}`} · {block.consultation_minutes} min · {count} slot{count === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <div className="flex gap-1">
        <button type="button" onClick={onEdit} className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50">
          Edit
        </button>
        <InlineAction
          action={toggleAvailability}
          fields={{ id: block.id, active: String(!block.is_active) }}
          label={block.is_active ? "Pause" : "Resume"}
          pendingLabel="Saving…"
        />
        <InlineAction
          action={deleteAvailability}
          fields={{ id: block.id }}
          label="Delete"
          pendingLabel="Deleting…"
          tone="danger"
          confirmText="Delete these hours?"
          ariaLabel={`Delete ${dayLabel} ${formatClock(block.start_time)} block`}
        />
      </div>
    </li>
  );
}

function BlockForm({
  mode,
  block,
  weekday,
  chambers,
  offersOnline,
  offersInPerson,
  onDone,
}: {
  mode: "add" | "edit";
  block?: DoctorAvailability;
  weekday: number;
  chambers: Chamber[];
  offersOnline: boolean;
  offersInPerson: boolean;
  onDone: () => void;
}) {
  const action = mode === "add" ? addAvailability : updateAvailability;
  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res?.message) onDone();
    return res;
  }, undefined);

  const [start, setStart] = useState(block?.start_time.slice(0, 5) ?? "17:00");
  const [end, setEnd] = useState(block?.end_time.slice(0, 5) ?? "21:00");
  const [type, setType] = useState<string>(block?.consultation_type ?? (offersOnline || !offersInPerson ? "online" : "in_person"));
  const [chamber, setChamber] = useState(block?.chamber_id ?? chambers[0]?.id ?? "");
  const [minutes, setMinutes] = useState(block?.consultation_minutes ?? DEFAULT_CONSULTATION_MINUTES);
  const e = state?.fieldErrors;
  const count = start && end ? slotsInBlock(start, end, minutes) : 0;
  const field = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600";
  const err = (k: string) => e?.[k]?.[0] && <p className="mt-1 text-xs text-red-600">{e[k]![0]}</p>;

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {mode === "edit" && <input type="hidden" name="id" value={block!.id} />}
      <input type="hidden" name={mode === "add" ? "weekdays" : "weekday"} value={weekday} />
      {state?.error && <Alert>{state.error}</Alert>}
      {(() => {
        const visible = new Set(["startTime", "endTime", "consultationMinutes", "consultationType", ...(type === "in_person" ? ["chamberId"] : [])]);
        const hidden = Object.entries(e ?? {}).filter(([k, v]) => !visible.has(k) && v?.length);
        return hidden.length ? <Alert>{hidden.map(([, v]) => v![0]).join(" ")}</Alert> : null;
      })()}

      {mode === "add" && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setStart(p.start);
                setEnd(p.end);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                start === p.start && end === p.end ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 text-slate-700 hover:bg-white"
              }`}
            >
              {p.label} {formatClock(p.start)}–{formatClock(p.end)}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium text-slate-800">
          From
          <input name="startTime" type="time" step={900} value={start} onChange={(ev) => setStart(ev.target.value)} className={`mt-1 ${field}`} />
          {err("startTime")}
        </label>
        <label className="text-sm font-medium text-slate-800">
          To
          <input name="endTime" type="time" step={900} value={end} onChange={(ev) => setEnd(ev.target.value)} className={`mt-1 ${field}`} />
          {err("endTime")}
        </label>
        <label className="text-sm font-medium text-slate-800">
          Consultation (min)
          <input
            name="consultationMinutes"
            type="number"
            min={MIN_CONSULTATION_MINUTES}
            max={MAX_CONSULTATION_MINUTES}
            value={minutes}
            onChange={(ev) => setMinutes(Number(ev.target.value))}
            className={`mt-1 ${field}`}
          />
          {err("consultationMinutes")}
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-800">
          Type
          <select name="consultationType" value={type} onChange={(ev) => setType(ev.target.value)} className={`mt-1 ${field}`}>
            <option value="online">Online (video)</option>
            <option value="in_person">In-person at chamber</option>
          </select>
          {err("consultationType")}
        </label>
        {type === "in_person" && (
          <label className="text-sm font-medium text-slate-800">
            Chamber
            <select name="chamberId" value={chamber} onChange={(ev) => setChamber(ev.target.value)} className={`mt-1 ${field}`}>
              {chambers.length === 0 && <option value="">Add a chamber in your portfolio first</option>}
              {chambers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {err("chamberId")}
          </label>
        )}
      </div>

      <p className="text-xs text-slate-600">
        {count > 0
          ? `${count} slot${count === 1 ? "" : "s"} — a new patient every ${SLOT_INTERVAL_MINUTES} min, ${minutes}-min consultation.`
          : "This block is too short for a consultation."}
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || count === 0}>
          {pending ? "Saving…" : mode === "add" ? "Add hours" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function CopyDayForm({ from, fromLabel, onDone }: { from: number; fromLabel: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await copyDay(prev, fd);
    if (res?.message) onDone();
    return res;
  }, undefined);
  const [picked, setPicked] = useState<number[]>([]);
  const others = WEEKDAYS.filter((d) => d.value !== from);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="from" value={from} />
      {picked.map((d) => (
        <input key={d} type="hidden" name="to" value={d} />
      ))}
      {state?.error && <Alert>{state.error}</Alert>}
      <p className="text-sm text-slate-700">
        Copy <strong>{fromLabel}</strong>&apos;s hours to:
      </p>
      <div className="flex flex-wrap gap-2">
        {others.map((d) => {
          const on = picked.includes(d.value);
          return (
            <button
              key={d.value}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked((p) => (on ? p.filter((x) => x !== d.value) : [...p, d.value]))}
              className={`h-9 min-w-12 rounded-lg border px-3 text-sm font-medium ${
                on ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-teal-50"
              }`}
            >
              {d.short}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">This replaces any hours those days already have.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || picked.length === 0}>
          {pending ? "Copying…" : `Copy to ${picked.length || ""} day${picked.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </form>
  );
}
