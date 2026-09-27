"use client";

import { useActionState, useState } from "react";
import { reviewRequest } from "../actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea-field";
import type { VerificationStatus } from "@/types/database";

/** Approve / reject a pending request, or revoke an approved one. */
export function ReviewPanel({ requestId, status }: { requestId: string; status: VerificationStatus }) {
  const [state, action, pending] = useActionState(reviewRequest, undefined);
  const [mode, setMode] = useState<"reject" | "revoke" | null>(null);

  if (state?.message) return <Alert kind="success">{state.message}</Alert>;

  if (status !== "pending" && status !== "approved") {
    return (
      <p className="text-sm text-slate-600">
        {status === "rejected"
          ? "Waiting for the doctor to update their documents and resubmit."
          : "The doctor hasn't submitted this request yet."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state?.error && <Alert>{state.error}</Alert>}

      {mode === null && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {status === "pending" ? (
            <>
              <form action={action}>
                <input type="hidden" name="requestId" value={requestId} />
                <input type="hidden" name="decision" value="approve" />
                <Button
                  type="submit"
                  disabled={pending}
                  className="w-full sm:w-auto"
                  onClick={(e) => {
                    if (!confirm("Approve this doctor? Their page will become public.")) e.preventDefault();
                  }}
                >
                  {pending ? "Saving…" : "Approve"}
                </Button>
              </form>
              <Button type="button" variant="secondary" onClick={() => setMode("reject")}>
                Reject…
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setMode("revoke")}>
              Revoke verification…
            </Button>
          )}
        </div>
      )}

      {mode && (
        <form action={action} className="flex animate-fade-down flex-col gap-3" noValidate>
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="decision" value={mode} />
          <TextareaField
            label={mode === "reject" ? "Reason for rejection" : "Reason for revoking"}
            name="reason"
            rows={4}
            maxLength={1000}
            placeholder={
              mode === "reject"
                ? "e.g. The license document is blurry — please upload a clear scan of your BMDC certificate."
                : "e.g. License expired / reported misconduct."
            }
            defaultValue={state?.values?.reason}
            errors={state?.fieldErrors?.reason}
            required
          />
          <p className="-mt-1 text-xs text-slate-500">The doctor will see this message.</p>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="bg-red-700 hover:bg-red-800 disabled:bg-red-700/60">
              {pending ? "Saving…" : mode === "reject" ? "Reject request" : "Revoke verification"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode(null)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
