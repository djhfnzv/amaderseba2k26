"use client";

import { useActionState } from "react";
import { saveSettings } from "../payments/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { PlatformSettings } from "@/types/database";

export function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const [state, action, pending] = useActionState(saveSettings, undefined);
  const e = state?.fieldErrors;
  const v = (k: string, saved: number) => state?.values?.[k] ?? String(saved);

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold text-slate-900">Commission & payment</legend>
        <Field label="Platform commission (%)" name="commissionPercent" type="number" step="0.01" min={0} max={100}
          defaultValue={v("commissionPercent", settings.commission_percent)} errors={e?.commissionPercent}
          hint="Kept by MedLife from each online payment." />
        <Field label="Time to pay (minutes)" name="paymentWindowMinutes" type="number" min={5} max={60}
          defaultValue={v("paymentWindowMinutes", settings.payment_window_minutes)} errors={e?.paymentWindowMinutes}
          hint="How long a slot is kept while the patient pays." />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold text-slate-900">Refund policy (patient cancels)</legend>
        <Field label="Full refund if cancelled at least (hours before)" name="refundFullHours" type="number" min={2} max={720}
          defaultValue={v("refundFullHours", settings.refund_full_hours)} errors={e?.refundFullHours} />
        <Field label="Refund if cancelled later (%)" name="refundPartialPercent" type="number" min={0} max={100}
          defaultValue={v("refundPartialPercent", settings.refund_partial_percent)} errors={e?.refundPartialPercent}
          hint="Patients can't cancel online within 2 hours of the start." />
      </fieldset>
      <p className="-mt-2 text-sm text-slate-600">If the doctor or an admin cancels, the patient always gets a full refund.</p>

      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
