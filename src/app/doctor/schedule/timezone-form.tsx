"use client";

import { useActionState } from "react";
import { saveTimezone } from "./actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { COMMON_TIMEZONES } from "@/lib/schedule/constants";

export function TimezoneForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(saveTimezone, undefined);
  const all = [...new Set([current, ...COMMON_TIMEZONES])];

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="timezone" className="text-sm font-medium text-slate-800">
          Your time zone
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={current}
          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
        >
          {all.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {(state?.error || state?.message) && (
        <div className="sm:basis-full">
          <Alert kind={state.error ? "error" : "success"}>{state.error ?? state.message}</Alert>
        </div>
      )}
    </form>
  );
}
