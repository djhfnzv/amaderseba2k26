"use client";

import { useActionState, useState } from "react";
import { saveBasicInfo } from "../actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { TagInput } from "@/components/ui/tag-input";
import { TextareaField } from "@/components/ui/textarea-field";
import {
  COMMON_LANGUAGES,
  MAX_LANGUAGES,
  MAX_SPECIALTIES,
} from "@/lib/doctor/constants";
import type { DoctorProfile, Specialty } from "@/types/database";

export function BasicInfoForm({
  profile,
  specialties,
  selectedSpecialtyIds,
  siteUrl,
}: {
  profile: DoctorProfile;
  specialties: Specialty[];
  selectedSpecialtyIds: number[];
  siteUrl: string;
}) {
  const [state, action, pending] = useActionState(saveBasicInfo, undefined);
  const [selected, setSelected] = useState<number[]>(selectedSpecialtyIds);
  const [offersOnline, setOffersOnline] = useState(profile.offers_online);
  const [offersInPerson, setOffersInPerson] = useState(profile.offers_in_person);
  const e = state?.fieldErrors;
  const v = (key: string, saved: string | number | null) =>
    state?.values?.[key] ?? (saved == null ? "" : String(saved));

  function toggleSpecialty(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_SPECIALTIES ? [...prev, id] : prev,
    );
  }

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name shown on your page"
          name="displayName"
          defaultValue={v("displayName", profile.display_name)}
          errors={e?.displayName}
          maxLength={120}
          required
        />
        <Field
          label="Headline"
          name="headline"
          placeholder="Consultant Cardiologist"
          defaultValue={v("headline", profile.headline)}
          errors={e?.headline}
          maxLength={120}
        />
        <Field
          label="Medical license (BMDC) number"
          name="licenseNumber"
          placeholder="A-12345"
          defaultValue={v("licenseNumber", profile.license_number)}
          errors={e?.licenseNumber}
          maxLength={50}
        />
        <Field
          label="Practicing since (year)"
          name="practiceSinceYear"
          type="number"
          inputMode="numeric"
          min={1950}
          max={new Date().getFullYear()}
          placeholder="2012"
          defaultValue={v("practiceSinceYear", profile.practice_since_year)}
          errors={e?.practiceSinceYear}
        />
        <div className="sm:col-span-2">
          <Field
            label="Page address"
            name="slug"
            defaultValue={v("slug", profile.slug)}
            errors={e?.slug}
            hint={`${siteUrl.replace(/^https?:\/\//, "")}/doctors/your-address — lowercase letters, numbers and hyphens`}
            maxLength={80}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <TextareaField
            label="About you"
            name="bio"
            rows={5}
            maxLength={3000}
            placeholder="Your experience, areas of interest and approach to care."
            defaultValue={v("bio", profile.bio)}
            errors={e?.bio}
          />
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-800">
          Specialties <span className="font-normal text-slate-500">(up to {MAX_SPECIALTIES}; first selected is shown as primary)</span>
        </legend>
        {selected.map((id) => (
          <input key={id} type="hidden" name="specialtyIds" value={id} />
        ))}
        <div className="mt-2 flex flex-wrap gap-2">
          {specialties.map((s) => {
            const on = selected.includes(s.id);
            const full = !on && selected.length >= MAX_SPECIALTIES;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                disabled={full}
                onClick={() => toggleSpecialty(s.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  on
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-300 text-slate-700 hover:border-teal-400 hover:bg-teal-50"
                }`}
              >
                {s.name}
                {on && selected[0] === s.id && selected.length > 1 && " ★"}
              </button>
            );
          })}
        </div>
        {e?.specialtyIds && <p className="mt-1.5 text-xs text-red-600">{e.specialtyIds[0]}</p>}
      </fieldset>

      <TagInput
        label="Languages"
        name="languages"
        defaultValue={profile.languages}
        suggestions={COMMON_LANGUAGES}
        placeholder="e.g. Bangla"
        maxTags={MAX_LANGUAGES}
        maxLength={40}
        errors={e?.languages}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-slate-800">Consultation types & fees (৳)</legend>
        <FeeRow
          label="Online (video) consultation"
          checkboxName="offersOnline"
          feeName="feeOnline"
          checked={offersOnline}
          onCheckedChange={setOffersOnline}
          defaultFee={v("feeOnline", profile.fee_online)}
          errors={e?.feeOnline}
        />
        <FeeRow
          label="In-person visit at chamber"
          checkboxName="offersInPerson"
          feeName="feeInPerson"
          checked={offersInPerson}
          onCheckedChange={setOffersInPerson}
          defaultFee={v("feeInPerson", profile.fee_in_person)}
          errors={e?.feeInPerson}
        />
      </fieldset>

      <Button type="submit" disabled={pending} className="sm:self-end">
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}

function FeeRow({
  label,
  checkboxName,
  feeName,
  checked,
  onCheckedChange,
  defaultFee,
  errors,
}: {
  label: string;
  checkboxName: string;
  feeName: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  defaultFee: string;
  errors?: string[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between">
      <label className="flex items-center gap-2 pt-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          name={checkboxName}
          checked={checked}
          onChange={(ev) => onCheckedChange(ev.target.checked)}
          className="size-4 accent-teal-700"
        />
        {label}
      </label>
      <div className="sm:w-48">
        <Field
          label="Fee (৳)"
          name={feeName}
          type="number"
          inputMode="decimal"
          min={0}
          step="1"
          placeholder="800"
          defaultValue={defaultFee}
          disabled={!checked}
          errors={errors}
        />
      </div>
    </div>
  );
}
