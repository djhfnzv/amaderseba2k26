"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { confirmBooking, releaseHold } from "@/lib/appointments/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea-field";
import { formatFee } from "@/lib/doctor/constants";
import type { ConsultationType } from "@/types/database";

/** A 1-second clock that only ticks in the browser (null during SSR/hydration). */
function subscribeClock(onTick: () => void) {
  const t = setInterval(onTick, 1000);
  return () => clearInterval(t);
}
const nowSeconds = () => Math.floor(Date.now() / 1000);

export function ConfirmForm({
  holdId,
  slug,
  expiresAt,
  consultationType,
  fee,
}: {
  holdId: string;
  slug: string;
  expiresAt: string;
  consultationType: ConsultationType;
  fee: number | null;
}) {
  const [payment, setPayment] = useState<"online" | "at_chamber">("online");
  const hasFee = (fee ?? 0) > 0;
  const paysOnline = hasFee && (consultationType === "online" || payment === "online");
  const [state, action, pending] = useActionState(confirmBooking, undefined);
  const now = useSyncExternalStore(subscribeClock, nowSeconds, () => null);
  const left = now === null ? null : Math.max(0, new Date(expiresAt).getTime() - now * 1000);
  const expired = left !== null && left <= 0;
  const mm = left === null ? 5 : Math.floor(left / 60000);
  const ss = left === null ? "00" : String(Math.floor((left % 60000) / 1000)).padStart(2, "0");

  return (
    <div className="flex flex-col gap-4">
      <p
        role="timer"
        aria-live="off"
        className={`rounded-lg p-3 text-sm font-medium ${expired ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
      >
        {expired ? "Your hold has expired. Go back and pick the slot again." : `Slot held for you — ${mm}:${ss} left to confirm.`}
      </p>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="holdId" value={holdId} />
        <input type="hidden" name="payment" value={paysOnline ? "online" : "at_chamber"} />
        {state?.error && <Alert>{state.error}</Alert>}
        <TextareaField
          label="Reason for visit (optional)"
          name="note"
          maxLength={500}
          rows={3}
          placeholder="e.g. Chest pain for 2 days, follow-up of last visit"
        />
        <p className="text-xs text-slate-500">
          Shared only with this doctor. For emergencies, go to the nearest hospital.
        </p>
        {hasFee && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-slate-800">Payment</legend>
            {consultationType === "online" ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                Online consultations are paid in advance — card, bKash, Nagad or internet banking via SSLCommerz.
              </p>
            ) : (
              (["online", "at_chamber"] as const).map((opt) => (
                <label
                  key={opt}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-300 p-3 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50"
                >
                  <input
                    type="radio"
                    name="paymentChoice"
                    value={opt}
                    checked={payment === opt}
                    onChange={() => setPayment(opt)}
                    className="mt-0.5 size-4 accent-teal-700"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-slate-900">{opt === "online" ? "Pay now online" : "Pay at the chamber"}</span>
                    <span className="block text-slate-600">
                      {opt === "online" ? "Card, bKash, Nagad or internet banking via SSLCommerz." : "Pay the doctor's chamber on the day of your visit."}
                    </span>
                  </span>
                </label>
              ))
            )}
          </fieldset>
        )}
        <Button type="submit" disabled={pending || expired}>
          {pending
            ? paysOnline
              ? "Opening secure payment…"
              : "Confirming…"
            : paysOnline
              ? `Continue to pay ${formatFee(fee)}`
              : "Confirm appointment"}
        </Button>
        {paysOnline && (
          <p className="text-center text-xs text-slate-500">
            Your slot is kept for 15 minutes while you complete the payment.
          </p>
        )}
      </form>

      <form action={releaseHold}>
        <input type="hidden" name="holdId" value={holdId} />
        <input type="hidden" name="payment" value={paysOnline ? "online" : "at_chamber"} />
        <input type="hidden" name="slug" value={slug} />
        <button type="submit" className="w-full text-center text-sm font-medium text-slate-600 hover:text-slate-900">
          Choose a different time
        </button>
      </form>
    </div>
  );
}
