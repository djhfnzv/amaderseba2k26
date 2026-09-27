"use client";

import { useActionState } from "react";
import { submitForReview } from "./actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SubmitForm({ ready, resubmit }: { ready: boolean; resubmit: boolean }) {
  const [state, action, pending] = useActionState(submitForReview, undefined);

  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" required className="mt-0.5 size-4 accent-teal-700" />
        <span>
          I confirm these documents are genuine and belong to me. Submitting false documents will
          lead to permanent suspension.
        </span>
      </label>
      <Button type="submit" disabled={pending || !ready} className="sm:self-start">
        {pending ? "Submitting…" : resubmit ? "Resubmit for review" : "Submit for review"}
      </Button>
      {!ready && (
        <p className="text-xs text-slate-500">Complete every item in the checklist above to submit.</p>
      )}
    </form>
  );
}
