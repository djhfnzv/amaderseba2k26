"use client";

import { useActionState } from "react";
import { payForAppointment } from "@/lib/appointments/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function PayButton({ appointmentId, label }: { appointmentId: string; label: string }) {
  const [state, action, pending] = useActionState(payForAppointment, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      {state?.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Opening secure payment…" : label}
      </Button>
    </form>
  );
}
