"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { LAB_TEST_CATEGORIES } from "@/lib/prescriptions/constants";
import { addLabTest, addSpecialty, updateSpecialty } from "./actions";

const input =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-shadow focus:ring-2 focus:ring-teal-600";

export function AddSpecialtyForm() {
  const [state, action] = useActionState(addSpecialty, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.message) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <input name="name" required maxLength={80} placeholder="Name, e.g. Nephrology" defaultValue={state?.values?.name} className={input} aria-label="Specialty name" />
        <input name="description" maxLength={200} placeholder="Short description (optional)" defaultValue={state?.values?.description} className={input} aria-label="Description" />
        <Submit label="Add" />
      </div>
      {state?.error && <Alert>{state.fieldErrors?.name?.[0] ?? state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
    </form>
  );
}

export function EditSpecialtyForm({ id, name, description }: { id: number; name: string; description: string | null }) {
  const [state, action] = useActionState(updateSpecialty, undefined);
  return (
    <form action={action} className="mt-2 flex animate-fade-down flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="name" required maxLength={80} defaultValue={name} className={input} aria-label="Name" />
      <input name="description" maxLength={200} defaultValue={description ?? ""} placeholder="Short description" className={input} aria-label="Description" />
      <div className="flex items-center gap-2">
        <Submit label="Save" />
        {state?.error && <span className="text-xs text-red-700">{state.error}</span>}
        {state?.message && <span className="animate-fade-in text-xs text-emerald-700">{state.message}</span>}
      </div>
    </form>
  );
}

export function AddLabTestForm() {
  const [state, action] = useActionState(addLabTest, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.message) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
        <input name="name" required maxLength={100} placeholder="Test name, e.g. Serum uric acid" defaultValue={state?.values?.name} className={input} aria-label="Test name" />
        <select name="category" defaultValue={state?.values?.category ?? "blood"} className={input} aria-label="Category">
          {LAB_TEST_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <Submit label="Add" />
      </div>
      {state?.error && <Alert>{state.fieldErrors?.name?.[0] ?? state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-10 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white transition-[background-color,scale] hover:bg-teal-800 active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? "…" : label}
    </button>
  );
}
