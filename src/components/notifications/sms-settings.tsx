"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { removeSmsPhone, requestPhoneCode, setSmsEnabled, verifyPhoneCode } from "@/lib/notifications/actions";
import { formatBdPhone } from "@/lib/sms/phone";

/** Add / verify a mobile number for SMS alerts, and turn them on or off. */
export function SmsSettings({
  phone,
  enabled,
  live,
}: {
  phone: string | null;
  enabled: boolean;
  /** False while SMS runs in test (log-only) mode. */
  live: boolean;
}) {
  const [changing, setChanging] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {!live && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          SMS is in test mode: messages are recorded but not sent yet.
        </p>
      )}

      {phone && !changing ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
            <div>
              <p className="text-sm text-slate-500">Mobile number</p>
              <p className="font-semibold text-slate-900">
                {formatBdPhone(phone)} <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">Verified</span>
              </p>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => setChanging(true)} className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50">
                Change
              </button>
              <form action={removeSmsPhone} onSubmit={(e) => { if (!confirm("Remove this number? You'll stop getting SMS alerts.")) e.preventDefault(); }}>
                <button type="submit" className="rounded-md px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50">Remove</button>
              </form>
            </div>
          </div>
          <form action={setSmsEnabled} className="flex flex-wrap items-center justify-between gap-3">
            <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
            <div>
              <p className="font-medium text-slate-900">SMS alerts are {enabled ? "on" : "off"}</p>
              <p className="text-sm text-slate-600">Bookings, changes, reminders, prescriptions{" "}and account updates.</p>
            </div>
            <ToggleButton on={enabled} />
          </form>
        </div>
      ) : (
        <PhoneForm onCancel={phone ? () => setChanging(false) : undefined} />
      )}
    </div>
  );
}

function PhoneForm({ onCancel }: { onCancel?: () => void }) {
  const [sendState, sendAction] = useActionState(requestPhoneCode, undefined);
  const [verifyState, verifyAction] = useActionState(verifyPhoneCode, undefined);
  const phone = sendState?.values?.phone ?? "";
  const onCodeStep = sendState?.values?.step === "code" && !verifyState?.message;

  if (verifyState?.message) return <Alert kind="success">{verifyState.message}</Alert>;

  return (
    <div className="flex flex-col gap-4">
      <form action={sendAction} className="flex flex-col gap-2">
        <label htmlFor="sms-phone" className="text-sm font-medium text-slate-800">Mobile number</label>
        <div className="flex flex-wrap gap-2">
          <input
            id="sms-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={phone}
            placeholder="01712-345678"
            required
            className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600 sm:max-w-xs"
          />
          <Submit label={onCodeStep ? "Send again" : "Send code"} pendingLabel="Sending…" secondary={onCodeStep} />
          {onCancel && (
            <button type="button" onClick={onCancel} className="h-11 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Cancel
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">Bangladeshi mobile numbers only. We&apos;ll text a code to confirm it&apos;s yours.</p>
        {sendState?.error && <Alert>{sendState.error}</Alert>}
        {sendState?.message && <Alert kind="success">{sendState.message}</Alert>}
      </form>

      {onCodeStep && (
        <form action={verifyAction} className="flex animate-fade-in flex-col gap-2">
          <input type="hidden" name="phone" value={phone} />
          <label htmlFor="sms-code" className="text-sm font-medium text-slate-800">6-digit code</label>
          <div className="flex flex-wrap gap-2">
            <input
              id="sms-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              className="h-11 w-40 rounded-lg border border-slate-300 bg-white px-3 text-center font-mono text-lg tracking-[0.3em] text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
            />
            <Submit label="Confirm number" pendingLabel="Checking…" />
          </div>
          {verifyState?.error && <Alert>{verifyState.error}</Alert>}
        </form>
      )}
    </div>
  );
}

function Submit({ label, pendingLabel, secondary }: { label: string; pendingLabel: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-60 ${
        secondary ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50" : "bg-teal-700 text-white hover:bg-teal-800"
      }`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function ToggleButton({ on }: { on: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label="SMS alerts"
      disabled={pending}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-teal-700" : "bg-slate-300"}`}
    >
      <span className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
    </button>
  );
}
