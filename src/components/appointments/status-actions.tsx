"use client";

import { useActionState } from "react";
import { updateAppointmentStatus } from "@/lib/appointments/actions";
import { Alert } from "@/components/ui/alert";
import type { AppointmentStatus } from "@/types/database";

/** Doctor buttons: start / complete / no-show. The DB enforces timing rules. */
export function StatusActions({ appointmentId, status }: { appointmentId: string; status: AppointmentStatus }) {
  const [state, action, pending] = useActionState(updateAppointmentStatus, undefined);
  const btn = "h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-50";

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={appointmentId} />
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        {status === "confirmed" && (
          <button type="submit" name="action" value="start" disabled={pending} className={`${btn} bg-teal-700 text-white hover:bg-teal-800`}>
            Start consultation
          </button>
        )}
        {(status === "confirmed" || status === "in_progress") && (
          <button type="submit" name="action" value="complete" disabled={pending} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}>
            Mark completed
          </button>
        )}
        {status === "confirmed" && (
          <button type="submit" name="action" value="no_show" disabled={pending} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
            Patient didn&apos;t come
          </button>
        )}
      </div>
    </form>
  );
}
