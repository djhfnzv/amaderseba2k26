"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { signIn } from "../actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cancelLoginSplash, startLoginSplash } from "@/components/motion/login-splash";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);

  // Login failed: bring the form back from under the splash.
  useEffect(() => {
    if (state?.error || state?.fieldErrors) cancelLoginSplash();
  }, [state]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const data = new FormData(e.currentTarget);
        if (String(data.get("email") ?? "").trim() && String(data.get("password") ?? "")) startLoginSplash();
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {state?.error && <Alert>{state.error}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}

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
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        errors={state?.fieldErrors?.password}
        required
      />
      <div className="-mt-2 text-right">
        <Link href="/forgot-password" className="text-sm text-teal-700 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
