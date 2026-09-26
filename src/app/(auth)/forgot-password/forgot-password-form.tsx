"use client";

import { useActionState } from "react";
import { forgotPassword } from "../actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPassword, undefined);

  if (state?.message) return <Alert kind="success">{state.message}</Alert>;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
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
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
