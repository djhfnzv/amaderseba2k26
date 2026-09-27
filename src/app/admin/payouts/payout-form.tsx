"use client";

import { useActionState } from "react";
import { recordPayout } from "../payments/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";

export function PayoutForm({ doctors }: { doctors: { id: string; name: string; balance: number }[] }) {
  const [state, action, pending] = useActionState(recordPayout, undefined);
  const e = state?.fieldErrors;

  if (doctors.length === 0) {
    return <p className="text-sm text-slate-600">No doctor has a balance to pay out right now.</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <SelectField
        label="Doctor"
        name="doctorId"
        placeholder="Choose doctor…"
        defaultValue={state?.values?.doctorId}
        options={doctors.map((d) => ({ value: d.id, label: `${d.name} — balance ৳${d.balance.toLocaleString("en-US")}` }))}
        errors={e?.doctorId}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (৳)" name="amount" type="number" inputMode="decimal" min={1} step="0.01" defaultValue={state?.values?.amount} errors={e?.amount} />
        <SelectField
          label="Method"
          name="method"
          placeholder={null}
          defaultValue={state?.values?.method ?? "bank"}
          options={[
            { value: "bank", label: "Bank transfer" },
            { value: "bkash", label: "bKash" },
            { value: "nagad", label: "Nagad" },
            { value: "cash", label: "Cash" },
            { value: "other", label: "Other" },
          ]}
          errors={e?.method}
        />
      </div>
      <Field label="Reference (optional)" name="reference" maxLength={120} placeholder="Bank / wallet transaction ID" defaultValue={state?.values?.reference} />
      <Field label="Note (optional)" name="note" maxLength={500} defaultValue={state?.values?.note} />
      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? "Saving…" : "Record payout"}
      </Button>
    </form>
  );
}
