"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { createPrescription } from "@/lib/prescriptions/actions";
import type { DoctorPatient } from "@/lib/prescriptions/queries";

export function NewPrescriptionForm({ patients, initialPatientId }: { patients: DoctorPatient[]; initialPatientId?: string }) {
  const [state, action] = useActionState(createPrescription, undefined);
  const [mode, setMode] = useState<"patient" | "manual">(patients.length ? "patient" : "manual");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState(initialPatientId ?? "");
  const errors = state?.fieldErrors ?? {};
  const v = state?.values ?? {};

  const shown = patients.filter((p) =>
    `${p.full_name} ${p.email} ${p.phone ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="mode" value={mode} />
      <fieldset>
        <legend className="text-sm font-medium text-slate-800">Who is it for?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ModeCard
            active={mode === "patient"}
            onClick={() => setMode("patient")}
            title="One of my patients"
            text="Details, allergies and history come from their MedLife profile."
            disabled={!patients.length}
          />
          <ModeCard
            active={mode === "manual"}
            onClick={() => setMode("manual")}
            title="Enter details manually"
            text="For a walk-in or anyone without a MedLife account."
          />
        </div>
      </fieldset>

      {mode === "patient" ? (
        <div className="flex animate-fade-in flex-col gap-3">
          <label htmlFor="patient-filter" className="sr-only">Filter patients</label>
          <input
            id="patient-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by name, email or phone…"
            className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
          />
          <div role="radiogroup" aria-label="Patient" className="max-h-80 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200">
            {shown.length === 0 && <p className="p-4 text-sm text-slate-500">No patients match.</p>}
            {shown.map((p) => (
              <label key={p.id} className={`flex cursor-pointer items-center gap-3 p-3 hover:bg-slate-50 ${picked === p.id ? "bg-teal-50" : ""}`}>
                <input
                  type="radio"
                  name="patientId"
                  value={p.id}
                  checked={picked === p.id}
                  onChange={() => setPicked(p.id)}
                  className="size-4 accent-teal-700"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{p.full_name || p.email || "Patient"}</span>
                  <span className="block truncate text-sm text-slate-500">{[p.email, p.phone].filter(Boolean).join(" · ")}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid animate-fade-in gap-4 sm:grid-cols-2">
          <Input name="patient_name" label="Patient name" defaultValue={v.patient_name} errors={errors.patient_name} required />
          <Input name="patient_phone" label="Phone (optional)" defaultValue={v.patient_phone} errors={errors.patient_phone} />
          <Input name="patient_age" label="Age" defaultValue={v.patient_age} placeholder="32 y" errors={errors.patient_age} />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
            Sex
            <select
              name="patient_sex"
              defaultValue={v.patient_sex ?? ""}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="">—</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Input name="patient_weight" label="Weight (optional)" defaultValue={v.patient_weight} placeholder="60 kg" errors={errors.patient_weight} />
        </div>
      )}

      {state?.error && <Alert>{state.error}</Alert>}
      <Submit disabled={mode === "patient" && !picked} />
    </form>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  text,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  text: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-xl border p-4 text-left transition-colors disabled:opacity-50 ${
        active ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600" : "border-slate-200 bg-white hover:border-teal-300"
      }`}
    >
      <span className="block font-semibold text-slate-900">{title}</span>
      <span className="mt-0.5 block text-sm text-slate-600">{disabled ? "You don't have any patients yet." : text}</span>
    </button>
  );
}

function Input({
  name,
  label,
  errors,
  ...props
}: { name: string; label: string; errors?: string[] } & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
      {label}
      <input
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        className={`h-11 rounded-lg border bg-white px-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600 ${errors?.length ? "border-red-500" : "border-slate-300"}`}
        {...props}
      />
      {errors?.[0] && <span className="text-xs text-red-600">{errors[0]}</span>}
    </label>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="h-11 self-start rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
    >
      {pending ? "Starting…" : "Start prescription"}
    </button>
  );
}
