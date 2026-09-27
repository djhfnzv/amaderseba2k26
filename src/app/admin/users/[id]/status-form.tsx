"use client";

import { useActionState, useState } from "react";
import { setUserStatus } from "../actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea-field";
import type { AccountStatus, Role } from "@/types/database";

export function StatusForm({
  userId,
  status,
  role,
  upcomingCount,
}: {
  userId: string;
  status: AccountStatus;
  role: Role;
  upcomingCount: number;
}) {
  const [state, action, pending] = useActionState(setUserStatus, undefined);
  const [open, setOpen] = useState(false);

  if (state?.message) return <Alert kind="success">{state.message}</Alert>;

  if (status === "suspended") {
    return (
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="status" value="active" />
        {state?.error && <Alert>{state.error}</Alert>}
        <p className="text-sm text-slate-600">
          Reactivating lets the user log in again.
          {role === "doctor" && " Their public page returns if they are still verified."}
          {" "}Cancelled appointments are not restored.
        </p>
        <Button type="submit" disabled={pending} className="sm:self-start">
          {pending ? "Reactivating…" : "Reactivate account"}
        </Button>
      </form>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="border-red-300 text-red-700 hover:bg-red-50 sm:self-start">
        Suspend account…
      </Button>
    );
  }

  return (
    <form action={action} className="flex animate-fade-down flex-col gap-3" noValidate>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value="suspended" />
      {state?.error && <Alert>{state.error}</Alert>}
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li>The user is signed out and cannot log in.</li>
        {role === "doctor" && <li>Their public page and search listing disappear.</li>}
        {upcomingCount > 0 && (
          <li>
            <strong>{upcomingCount}</strong> upcoming appointment{upcomingCount === 1 ? "" : "s"} will be cancelled
            {role === "doctor" ? " — patients get a neutral message, not your reason." : "."}
          </li>
        )}
      </ul>
      <TextareaField
        label="Reason (shown to the user)"
        name="reason"
        rows={3}
        maxLength={1000}
        placeholder="e.g. Repeated no-shows / reported misconduct under review."
        defaultValue={state?.values?.reason}
        errors={state?.fieldErrors?.reason}
        required
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="bg-red-700 hover:bg-red-800 disabled:bg-red-700/60">
          {pending ? "Suspending…" : "Suspend account"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
