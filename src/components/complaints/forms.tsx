"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { fileComplaint, refundComplaint, replyComplaint, updateComplaint } from "@/lib/complaints/actions";
import { COMPLAINT_CATEGORIES, PRIORITIES, STATUS_LABEL } from "@/lib/complaints/constants";
import type { ComplaintPriority, ComplaintStatus } from "@/types/database";

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition-shadow focus:ring-2 focus:ring-teal-600";

export type AppointmentOption = { id: string; label: string };

// -----------------------------------------------------------------------------
// New complaint (patient / doctor)
// -----------------------------------------------------------------------------
export function ComplaintForm({
  role,
  appointments,
  appointmentId,
}: {
  role: "patient" | "doctor";
  appointments: AppointmentOption[];
  appointmentId?: string;
}) {
  const [state, action] = useActionState(fileComplaint, undefined);
  const errors = state?.fieldErrors ?? {};
  const v = state?.values ?? {};
  const [length, setLength] = useState((v.description ?? "").length);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
        What is it about?
        <select name="category" required defaultValue={v.category ?? ""} className={`${input} h-11`}>
          <option value="" disabled>
            Choose…
          </option>
          {COMPLAINT_CATEGORIES.filter((c) => c.roles.includes(role)).map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        {errors.category?.[0] && <span className="text-xs text-red-600">{errors.category[0]}</span>}
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
        Related appointment (optional)
        <select name="appointmentId" defaultValue={v.appointmentId ?? appointmentId ?? ""} className={`${input} h-11`}>
          <option value="">Not about a specific appointment</option>
          {appointments.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
        Subject
        <input
          name="subject"
          required
          minLength={5}
          maxLength={120}
          defaultValue={v.subject}
          placeholder="e.g. Doctor didn't join the video call"
          className={`${input} h-11`}
        />
        {errors.subject?.[0] && <span className="text-xs text-red-600">{errors.subject[0]}</span>}
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
        What happened?
        <textarea
          name="description"
          required
          minLength={10}
          maxLength={3000}
          rows={6}
          defaultValue={v.description}
          onChange={(e) => setLength(e.target.value.length)}
          placeholder="Tell us what happened, when, and what you'd like us to do."
          className={`${input} py-2`}
        />
        <span className="flex justify-between text-xs font-normal text-slate-500">
          <span>{errors.description?.[0] ? <span className="text-red-600">{errors.description[0]}</span> : "Please don't include passwords or card numbers."}</span>
          <span className="tabular-nums">{length}/3000</span>
        </span>
      </label>

      {state?.error && <Alert>{state.error}</Alert>}
      <Submit label="Submit complaint" pending="Submitting…" />
    </form>
  );
}

// -----------------------------------------------------------------------------
// Reply (everyone); admins can add an internal note
// -----------------------------------------------------------------------------
export function ReplyForm({ complaintId, isAdmin, closed }: { complaintId: string; isAdmin: boolean; closed: boolean }) {
  const [state, action] = useActionState(replyComplaint, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const [internal, setInternal] = useState(false);

  useEffect(() => {
    if (state?.message) ref.current?.reset();
  }, [state]);

  if (closed && !isAdmin) {
    return (
      <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        This complaint is closed. If you still need help, file a new complaint.
      </p>
    );
  }

  return (
    <form
      ref={ref}
      action={action}
      className={`flex flex-col gap-3 rounded-xl border p-3 transition-colors ${internal ? "border-amber-300 bg-amber-50/60" : "border-slate-200 bg-white"}`}
    >
      <input type="hidden" name="complaintId" value={complaintId} />
      <label htmlFor="reply-body" className="sr-only">Message</label>
      <textarea
        id="reply-body"
        name="body"
        required
        rows={3}
        maxLength={3000}
        defaultValue={state?.values?.body}
        placeholder={internal ? "Internal note — only admins can see this" : isAdmin ? "Reply to the complainant…" : "Add more details or reply…"}
        className="w-full resize-y rounded-lg border-0 bg-transparent px-1 py-1 text-base text-slate-900 outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isAdmin ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="internal"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
              className="size-4 accent-amber-600"
            />
            Internal note
          </label>
        ) : (
          <span />
        )}
        <Submit label={internal ? "Add note" : "Send"} pending="Sending…" small />
      </div>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
    </form>
  );
}

// -----------------------------------------------------------------------------
// Admin: status, priority, outcome
// -----------------------------------------------------------------------------
export function StatusForm({
  complaintId,
  status,
  priority,
  resolution,
}: {
  complaintId: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  resolution: string | null;
}) {
  const [state, action] = useActionState(updateComplaint, undefined);
  const [next, setNext] = useState<ComplaintStatus>((state?.values?.status as ComplaintStatus) ?? status);
  const closing = next === "resolved" || next === "rejected";

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="complaintId" value={complaintId} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Status
          <select
            name="status"
            value={next}
            onChange={(e) => setNext(e.target.value as ComplaintStatus)}
            className={`${input} h-10 text-sm`}
          >
            {(Object.keys(STATUS_LABEL) as ComplaintStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Priority
          <select name="priority" defaultValue={priority} className={`${input} h-10 text-sm`}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>
      {closing && (
        <label className="flex animate-fade-down flex-col gap-1 text-xs font-medium text-slate-600">
          Outcome (the complainant sees this)
          <textarea
            name="resolution"
            rows={3}
            maxLength={2000}
            required
            defaultValue={state?.values?.resolution ?? resolution ?? ""}
            placeholder={next === "resolved" ? "What we did to fix it…" : "Why no action is needed…"}
            className={`${input} py-2 text-sm`}
          />
          {state?.fieldErrors?.resolution?.[0] && <span className="text-red-600">{state.fieldErrors.resolution[0]}</span>}
        </label>
      )}
      {state?.error && !state.fieldErrors && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <Submit label={closing ? (next === "resolved" ? "Resolve" : "Close complaint") : "Save"} pending="Saving…" small />
    </form>
  );
}

// -----------------------------------------------------------------------------
// Admin: refund part/all of the appointment payment
// -----------------------------------------------------------------------------
export function RefundForm({ complaintId, refundable, paid }: { complaintId: string; refundable: number; paid: number }) {
  const [state, action] = useActionState(refundComplaint, undefined);
  const [amount, setAmount] = useState(String(refundable));
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= refundable;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Refund ৳${value.toLocaleString()} to the patient's original payment method?`)) e.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="complaintId" value={complaintId} />
      <p className="text-sm text-slate-600">
        Paid ৳{paid.toLocaleString()} · refundable <strong className="text-slate-900">৳{refundable.toLocaleString()}</strong>
      </p>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Amount</span>
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500">৳</span>
          <input
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${input} h-10 pl-7 tabular-nums`}
          />
        </label>
        {[1, 0.5].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setAmount(String(Math.round(refundable * f * 100) / 100))}
            className="h-10 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {f === 1 ? "Full" : "50%"}
          </button>
        ))}
      </div>
      {!valid && amount !== "" && (
        <p className="text-xs text-red-600">Enter an amount between 1 and {refundable.toLocaleString()}.</p>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <Submit label="Issue refund" pending="Refunding…" small disabled={!valid} />
    </form>
  );
}

function Submit({ label, pending, small, disabled }: { label: string; pending: string; small?: boolean; disabled?: boolean }) {
  const status = useFormStatus();
  return (
    <button
      type="submit"
      disabled={status.pending || disabled}
      className={`inline-flex items-center justify-center self-start rounded-lg bg-teal-700 font-semibold text-white transition-[background-color,scale] hover:bg-teal-800 active:scale-[0.98] disabled:opacity-60 ${
        small ? "h-9 px-3 text-sm" : "h-11 px-5 text-sm"
      }`}
    >
      {status.pending ? pending : label}
    </button>
  );
}
