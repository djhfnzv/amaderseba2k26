"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { FORM_OPTIONS } from "@/lib/prescriptions/constants";
import { addMedicine, importMedicines } from "./actions";

export function AddMedicineForm() {
  const [state, action] = useActionState(addMedicine, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const errors = state?.fieldErrors ?? {};
  const v = state?.values ?? {};

  useEffect(() => {
    if (state?.message) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <Field label="Generic name" name="generic_name" defaultValue={v.generic_name} errors={errors.generic_name} required />
      <Field label="Brand name (optional)" name="brand_name" defaultValue={v.brand_name} errors={errors.brand_name} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Strength" name="strength" placeholder="500 mg" defaultValue={v.strength} errors={errors.strength} />
        <SelectField label="Form" name="form" options={FORM_OPTIONS} defaultValue={v.form ?? "tablet"} placeholder={null} errors={errors.form} />
      </div>
      <Field label="Company (optional)" name="company" defaultValue={v.company} errors={errors.company} />
      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input type="checkbox" name="is_controlled" defaultChecked={v.is_controlled === "on"} className="size-4 accent-red-700" />
        Controlled drug (blocked in online consultations)
      </label>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <Submit label="Add medicine" />
    </form>
  );
}

export function ImportMedicinesForm() {
  const [state, action] = useActionState(importMedicines, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        CSV with a header row. Required: <code className="rounded bg-slate-100 px-1">generic_name</code>,{" "}
        <code className="rounded bg-slate-100 px-1">form</code>. Optional: <code className="rounded bg-slate-100 px-1">brand_name</code>,{" "}
        <code className="rounded bg-slate-100 px-1">strength</code>, <code className="rounded bg-slate-100 px-1">company</code>,{" "}
        <code className="rounded bg-slate-100 px-1">is_controlled</code> (yes/no). Duplicates are skipped.
      </p>
      <pre className="overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
        generic_name,brand_name,strength,form,company,is_controlled{"\n"}Paracetamol,Napa,500 mg,tablet,Beximco,no
      </pre>
      <label htmlFor="csv" className="text-sm font-medium text-slate-800">CSV file (max 2 MB)</label>
      <input
        id="csv"
        type="file"
        name="file"
        accept=".csv,text/csv"
        required
        className="text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-800 hover:file:bg-teal-100"
      />
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      {state?.error && <Alert>{state.error}</Alert>}
      <Submit label="Import" pendingLabel="Importing…" />
    </form>
  );
}

function Submit({ label, pendingLabel = "Saving…" }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-10 self-start rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
