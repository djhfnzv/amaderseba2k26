"use client";

import { useActionState, useState } from "react";
import { cancelAppointment } from "@/lib/appointments/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea-field";

/** Cancel with a reason. Doctors must give one (the patient sees it). */
export function CancelForm({ appointmentId, reasonRequired }: { appointmentId: string; reasonRequired: boolean }) {
  const [state, action, pending] = useActionState(cancelAppointment, undefined);
  const [open, setOpen] = useState(false);

  if (state?.message) return <Alert kind="success">{state.message}</Alert>;
  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        Cancel appointment…
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={appointmentId} />
      {state?.error && <Alert>{state.error}</Alert>}
      <TextareaField
        label={reasonRequired ? "Reason (the patient will see this)" : "Reason (optional)"}
        name="reason"
        rows={3}
        maxLength={500}
        defaultValue={state?.values?.reason}
        required={reasonRequired}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="bg-red-700 hover:bg-red-800 disabled:bg-red-700/60">
          {pending ? "Cancelling…" : "Confirm cancellation"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          Keep it
        </Button>
      </div>
    </form>
  );
}
