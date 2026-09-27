"use client";

import { useActionState, useState } from "react";
import { addAvailability } from "./actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import {
  DEFAULT_CONSULTATION_MINUTES,
  MAX_CONSULTATION_MINUTES,
  MIN_CONSULTATION_MINUTES,
  SLOT_INTERVAL_MINUTES,
  WEEKDAYS,
  slotsInBlock,
} from "@/lib/schedule/constants";

type Chamber = { id: string; name: string };

export function AvailabilityForm({
  chambers,
  offersOnline,
  offersInPerson,
}: {
  chambers: Chamber[];
  offersOnline: boolean;
  offersInPerson: boolean;
}) {
  const [state, action, pending] = useActionState(addAvailability, undefined);
  const e = state?.fieldErrors;
  const [days, setDays] = useState<number[]>([]);
  const [type, setType] = useState<string>(
    state?.values?.consultationType ?? (offersOnline || !offersInPerson ? "online" : "in_person"),
  );
  const [start, setStart] = useState(state?.values?.startTime ?? "17:00");
  const [end, setEnd] = useState(state?.values?.endTime ?? "21:00");
  const [minutes, setMinutes] = useState(Number(state?.values?.consultationMinutes ?? DEFAULT_CONSULTATION_MINUTES));

  const count = start && end ? slotsInBlock(start, end, minutes) : 0;
  const toggleDay = (d: number) => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-800">Days</legend>
        {days.map((d) => (
          <input key={d} type="hidden" name="weekdays" value={d} />
        ))}
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => {
            const on = days.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDay(d.value)}
                className={`h-10 min-w-14 rounded-lg border px-3 text-sm font-medium ${
                  on ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 text-slate-700 hover:bg-teal-50"
                }`}
              >
                {d.short}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setDays([6, 0, 1, 2, 3])}
            className="h-10 rounded-lg px-2 text-sm font-medium text-teal-700 hover:underline"
          >
            Sat–Wed
          </button>
        </div>
        {e?.weekdays && <p className="mt-1.5 text-xs text-red-600">{e.weekdays[0]}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="From"
          name="startTime"
          type="time"
          step={900}
          value={start}
          onChange={(ev) => setStart(ev.target.value)}
          errors={e?.startTime}
        />
        <Field
          label="To"
          name="endTime"
          type="time"
          step={900}
          value={end}
          onChange={(ev) => setEnd(ev.target.value)}
          errors={e?.endTime}
        />
        <Field
          label={`Consultation (${MIN_CONSULTATION_MINUTES}–${MAX_CONSULTATION_MINUTES} min)`}
          name="consultationMinutes"
          type="number"
          inputMode="numeric"
          min={MIN_CONSULTATION_MINUTES}
          max={MAX_CONSULTATION_MINUTES}
          value={minutes}
          onChange={(ev) => setMinutes(Number(ev.target.value))}
          errors={e?.consultationMinutes}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Consultation type"
          name="consultationType"
          placeholder="Choose…"
          value={type}
          onChange={(ev) => setType(ev.target.value)}
          options={[
            { value: "online", label: "Online (video)" },
            { value: "in_person", label: "In-person at chamber" },
          ]}
          errors={e?.consultationType}
        />
        {type === "in_person" && (
          <SelectField
            label="Chamber"
            name="chamberId"
            placeholder={chambers.length ? "Choose chamber…" : "Add a chamber in your portfolio first"}
            defaultValue={state?.values?.chamberId ?? chambers[0]?.id ?? ""}
            options={chambers.map((c) => ({ value: c.id, label: c.name }))}
            errors={e?.chamberId}
          />
        )}
      </div>

      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        {count > 0 ? (
          <>
            <strong>{count} slot{count === 1 ? "" : "s"}</strong> per day — a new patient every {SLOT_INTERVAL_MINUTES}{" "}
            minutes, {minutes}-minute consultation, {SLOT_INTERVAL_MINUTES - minutes} minutes buffer.
          </>
        ) : (
          "This block is too short for a consultation."
        )}
      </p>

      <Button type="submit" disabled={pending} className="sm:self-end">
        {pending ? "Adding…" : "Add hours"}
      </Button>
    </form>
  );
}
