"use client";

import { useActionState } from "react";
import { retryRefundAction } from "./actions";

export function RefundRetry({ refundId }: { refundId: string }) {
  const [state, action, pending] = useActionState(retryRefundAction, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="refundId" value={refundId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
      >
        {pending ? "Retrying…" : "Retry"}
      </button>
      {state?.error && <span className="text-xs text-red-700">{state.error}</span>}
      {state?.message && <span className="text-xs text-emerald-700">{state.message}</span>}
    </form>
  );
}
