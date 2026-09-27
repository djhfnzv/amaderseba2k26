"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { createPrescription, sendAdvice } from "@/lib/prescriptions/actions";
import { ADVICE_SUGGESTIONS } from "@/lib/prescriptions/constants";

/** Doctor -> patient advice note, optionally tied to an appointment. */
export function AdviceForm({ patientId, appointmentId }: { patientId: string; appointmentId?: string }) {
  const [state, action] = useActionState(sendAdvice, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state?.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="appointmentId" value={appointmentId ?? ""} />
      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
        Title (optional)
        <input
          name="title"
          maxLength={120}
          placeholder="e.g. About your blood report"
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
        Advice
        <textarea
          ref={bodyRef}
          name="body"
          required
          rows={4}
          maxLength={5000}
          placeholder="Your advice to the patient…"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {ADVICE_SUGGESTIONS.slice(0, 5).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              const el = bodyRef.current;
              if (!el) return;
              el.value = el.value.trim() ? `${el.value.trimEnd()}\n${a}` : a;
              el.focus();
            }}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800"
          >
            + {a}
          </button>
        ))}
      </div>
      {state?.error && <Alert>{state.fieldErrors?.body?.[0] ?? state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <Submit label="Send advice" pendingLabel="Sending…" />
    </form>
  );
}

/** "Write prescription" for an appointment (reuses an open draft if there is one). */
export function StartPrescriptionButton({ appointmentId, label = "Write prescription" }: { appointmentId: string; label?: string }) {
  const [state, action] = useActionState(createPrescription, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <Submit label={label} pendingLabel="Opening…" />
      {state?.error && <Alert>{state.error}</Alert>}
    </form>
  );
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center self-start rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
