"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveHealthProfile } from "../actions";
import { TagInput } from "@/components/patient/tag-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { todayIso } from "@/lib/format";
import {
  BLOOD_GROUPS,
  COMMON_ALLERGIES,
  COMMON_CONDITIONS,
  SEX_OPTIONS,
} from "@/lib/patient/constants";
import type { PatientProfile } from "@/types/database";

export function ProfileForm({
  profile,
  welcome,
}: {
  profile: PatientProfile | null;
  welcome: boolean;
}) {
  const [state, action, pending] = useActionState(saveHealthProfile, undefined);
  const e = state?.fieldErrors;
  // After a failed save, keep what the patient typed; otherwise show saved values.
  const v = (key: string, saved: string | number | null | undefined) =>
    state?.values?.[key] ?? (saved == null ? "" : String(saved));

  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      {welcome && <input type="hidden" name="welcome" value="1" />}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}

      <Section title="Basic information">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Date of birth"
            name="dateOfBirth"
            type="date"
            min="1900-01-01"
            max={todayIso()}
            defaultValue={v("dateOfBirth", profile?.date_of_birth)}
            errors={e?.dateOfBirth}
          />
          <SelectField
            label="Sex"
            name="sex"
            options={SEX_OPTIONS}
            defaultValue={v("sex", profile?.sex)}
            errors={e?.sex}
          />
          <Field
            label="Weight (kg)"
            name="weightKg"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="1"
            max="500"
            defaultValue={v("weightKg", profile?.weight_kg)}
            errors={e?.weightKg}
          />
          <Field
            label="Height (cm)"
            name="heightCm"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="1"
            max="300"
            defaultValue={v("heightCm", profile?.height_cm)}
            errors={e?.heightCm}
          />
          <SelectField
            label="Blood group"
            name="bloodGroup"
            options={BLOOD_GROUPS.map((g) => ({ value: g, label: g }))}
            placeholder="Don't know"
            defaultValue={v("bloodGroup", profile?.blood_group)}
            errors={e?.bloodGroup}
          />
        </div>
      </Section>

      <Section
        title="Allergies & conditions"
        description="Doctors see this before your consultation. Allergies are used to warn doctors when prescribing."
      >
        <div className="flex flex-col gap-6">
          <TagInput
            label="Allergies"
            name="allergies"
            defaultValue={profile?.allergies ?? []}
            suggestions={COMMON_ALLERGIES}
            placeholder="e.g. Penicillin"
            errors={e?.allergies}
          />
          <TagInput
            label="Chronic conditions"
            name="chronicConditions"
            defaultValue={profile?.chronic_conditions ?? []}
            suggestions={COMMON_CONDITIONS}
            placeholder="e.g. Hypertension"
            errors={e?.chronicConditions}
          />
        </div>
      </Section>

      <Section title="Emergency contact" description="Optional. Someone we can reach in an emergency.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            name="emergencyContactName"
            autoComplete="off"
            defaultValue={v("emergencyContactName", profile?.emergency_contact_name)}
            errors={e?.emergencyContactName}
          />
          <Field
            label="Phone"
            name="emergencyContactPhone"
            type="tel"
            autoComplete="off"
            placeholder="+8801712345678"
            defaultValue={v("emergencyContactPhone", profile?.emergency_contact_phone)}
            errors={e?.emergencyContactPhone}
          />
        </div>
      </Section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {welcome && (
          <Link
            href="/patient"
            className="inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            Skip for now
          </Link>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : welcome ? "Save and continue" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <legend className="sr-only">{title}</legend>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-5">{children}</div>
    </fieldset>
  );
}
