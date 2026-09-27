"use client";

import { useActionState, useState } from "react";
import { addLeave } from "./actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function LeaveForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(addLeave, undefined);
  const [partDay, setPartDay] = useState(state?.values?.partDay === "on");
  const e = state?.fieldErrors;
  const v = state?.values;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From date" name="startDate" type="date" min={today} defaultValue={v?.startDate} errors={e?.startDate} required />
        <Field
          label={partDay ? "Date (same day)" : "To date (optional)"}
          name="endDate"
          type="date"
          min={today}
          defaultValue={v?.endDate}
          disabled={partDay}
          errors={e?.endDate}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input
          type="checkbox"
          name="partDay"
          checked={partDay}
          onChange={(ev) => setPartDay(ev.target.checked)}
          className="size-4 accent-teal-700"
        />
        Only part of the day
      </label>

      {partDay && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" name="startTime" type="time" step={900} defaultValue={v?.startTime} errors={e?.startTime} />
          <Field label="To" name="endTime" type="time" step={900} defaultValue={v?.endTime} errors={e?.endTime} />
        </div>
      )}

      <Field
        label="Note (optional, private)"
        name="reason"
        placeholder="e.g. Conference"
        maxLength={200}
        defaultValue={v?.reason}
        errors={e?.reason}
      />

      <Button type="submit" variant="secondary" disabled={pending} className="sm:self-end">
        {pending ? "Saving…" : "Block these dates"}
      </Button>
    </form>
  );
}
