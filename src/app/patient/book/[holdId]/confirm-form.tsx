"use client";

import { useActionState, useSyncExternalStore } from "react";
import { confirmBooking, releaseHold } from "@/lib/appointments/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea-field";

/** A 1-second clock that only ticks in the browser (null during SSR/hydration). */
function subscribeClock(onTick: () => void) {
  const t = setInterval(onTick, 1000);
  return () => clearInterval(t);
}
const nowSeconds = () => Math.floor(Date.now() / 1000);

export function ConfirmForm({ holdId, slug, expiresAt }: { holdId: string; slug: string; expiresAt: string }) {
  const [state, action, pending] = useActionState(confirmBooking, undefined);
  const now = useSyncExternalStore(subscribeClock, nowSeconds, () => null);
  const left = now === null ? null : Math.max(0, new Date(expiresAt).getTime() - now * 1000);
  const expired = left !== null && left <= 0;
  const mm = left === null ? 5 : Math.floor(left / 60000);
  const ss = left === null ? "00" : String(Math.floor((left % 60000) / 1000)).padStart(2, "0");

  return (
    <div className="flex flex-col gap-4">
      <p
        role="timer"
        aria-live="off"
        className={`rounded-lg p-3 text-sm font-medium ${expired ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
      >
        {expired ? "Your hold has expired. Go back and pick the slot again." : `Slot held for you — ${mm}:${ss} left to confirm.`}
      </p>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="holdId" value={holdId} />
        {state?.error && <Alert>{state.error}</Alert>}
        <TextareaField
          label="Reason for visit (optional)"
          name="note"
          maxLength={500}
          rows={3}
          placeholder="e.g. Chest pain for 2 days, follow-up of last visit"
        />
        <p className="text-xs text-slate-500">
          Shared only with this doctor. For emergencies, go to the nearest hospital.
        </p>
        <Button type="submit" disabled={pending || expired}>
          {pending ? "Confirming…" : "Confirm appointment"}
        </Button>
      </form>

      <form action={releaseHold}>
        <input type="hidden" name="holdId" value={holdId} />
        <input type="hidden" name="slug" value={slug} />
        <button type="submit" className="w-full text-center text-sm font-medium text-slate-600 hover:text-slate-900">
          Choose a different time
        </button>
      </form>
    </div>
  );
}
