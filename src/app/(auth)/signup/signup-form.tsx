"use client";

import { useActionState, useEffect } from "react";
import { signUp } from "../actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cancelLoginSplash, startLoginSplash } from "@/components/motion/login-splash";

const ROLE_OPTIONS = [
  { value: "patient", label: "I'm a patient", hint: "Find doctors and book visits" },
  { value: "doctor", label: "I'm a doctor", hint: "Build your portfolio, see patients" },
] as const;

export function SignupForm({ defaultRole }: { defaultRole: "patient" | "doctor" }) {
  const [state, action, pending] = useActionState(signUp, undefined);
  const role = state?.values?.role ?? defaultRole;

  useEffect(() => {
    if (state?.error || state?.fieldErrors) cancelLoginSplash();
  }, [state]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const data = new FormData(e.currentTarget);
        const filled = ["fullName", "email", "phone", "password"].every((k) => String(data.get(k) ?? "").trim());
        if (filled) startLoginSplash("Setting up your account…");
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {state?.error && <Alert>{state.error}</Alert>}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-800">Account type</legend>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer flex-col rounded-lg border border-slate-300 p-3 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600"
            >
              <input
                type="radio"
                name="role"
                value={o.value}
                defaultChecked={role === o.value}
                className="sr-only"
              />
              <span className="text-sm font-semibold text-slate-900">{o.label}</span>
              <span className="text-xs text-slate-500">{o.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label="Full name"
        name="fullName"
        autoComplete="name"
        defaultValue={state?.values?.fullName}
        errors={state?.fieldErrors?.fullName}
        required
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        defaultValue={state?.values?.email}
        errors={state?.fieldErrors?.email}
        required
      />
      <Field
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="01712-345678"
        hint="Your doctor or patient can reach you on it. Bangladeshi numbers only."
        defaultValue={state?.values?.phone}
        errors={state?.fieldErrors?.phone}
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, with a letter and a number"
        errors={state?.fieldErrors?.password}
        required
      />
      <Field
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        errors={state?.fieldErrors?.confirmPassword}
        required
      />

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="acceptTerms"
            defaultChecked={state?.values?.acceptTerms === "on"}
            className="mt-0.5 size-4 accent-teal-700"
          />
          <span>I agree to the Terms of Service and Privacy Policy.</span>
        </label>
        {state?.fieldErrors?.acceptTerms && (
          <p className="text-xs text-red-600">{state.fieldErrors.acceptTerms[0]}</p>
        )}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
