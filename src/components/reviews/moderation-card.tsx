"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { StarRating } from "@/components/reviews/stars";
import { LocalTime } from "@/components/ui/local-time";
import { moderateReview } from "@/lib/reviews/actions";
import type { ModerationRow } from "@/lib/reviews/queries";

/** One review in the admin queue: hide (with reason), restore or dismiss. */
export function ModerationCard({ review }: { review: ModerationRow }) {
  const [state, action] = useActionState(moderateReview, undefined);
  const [hiding, setHiding] = useState(false);
  const hidden = review.status === "hidden";
  const openReports = review.reports.filter((r) => !r.resolved_at);

  return (
    <li className={`rounded-2xl border bg-white p-5 ${hidden ? "border-amber-200" : review.flagged ? "border-red-200" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <StarRating value={review.rating} size="sm" />
            <span className="font-semibold text-slate-900">{review.rating}/5</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">
              for{" "}
              {review.doctor_slug ? (
                <a href={`/doctors/${review.doctor_slug}#reviews`} target="_blank" rel="noreferrer" className="font-medium text-teal-700 hover:underline">
                  {review.doctor_name}
                </a>
              ) : (
                review.doctor_name
              )}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            By {review.patient_name ?? "patient"}
            {review.is_anonymous && " (posted anonymously)"} · <LocalTime iso={review.created_at} />
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {hidden && <Badge tone="bg-amber-100 text-amber-800">Hidden</Badge>}
          {review.flagged && !hidden && <Badge tone="bg-red-50 text-red-700">{review.flag_reason ?? "Flagged"}</Badge>}
          {openReports.length > 0 && <Badge tone="bg-slate-100 text-slate-700">{openReports.length} report{openReports.length > 1 ? "s" : ""}</Badge>}
        </div>
      </div>

      {review.tags.length > 0 && <p className="mt-3 text-xs text-teal-800">{review.tags.join(" · ")}</p>}
      <p className="mt-2 text-sm whitespace-pre-line text-slate-800">{review.body || <span className="text-slate-400">No written comment.</span>}</p>
      {review.reply_body && (
        <p className="mt-2 border-l-4 border-slate-200 pl-3 text-sm text-slate-600">
          <span className="font-medium">Doctor&apos;s reply:</span> {review.reply_body}
        </p>
      )}
      {openReports.map((r, i) => (
        <p key={i} className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span className="font-semibold">Doctor reported:</span> {r.reason}
        </p>
      ))}
      {hidden && review.hidden_reason && <p className="mt-2 text-xs text-amber-800">Hidden because: {review.hidden_reason}</p>}

      <form action={action} className="mt-4 flex flex-col gap-2">
        <input type="hidden" name="id" value={review.id} />
        {hiding && (
          <div className="flex animate-fade-in flex-col gap-1.5">
            <label htmlFor={`reason-${review.id}`} className="text-sm font-medium text-slate-800">
              Reason (the patient sees this)
            </label>
            <input
              id={`reason-${review.id}`}
              name="reason"
              required
              maxLength={300}
              autoFocus
              defaultValue={state?.values?.reason}
              placeholder="e.g. Contains abusive language"
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
        )}
        {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
        <div className="flex flex-wrap gap-2">
          {hidden ? (
            <Act action="restore" label="Restore" />
          ) : hiding ? (
            <>
              <Act action="hide" label="Hide review" danger />
              <button type="button" onClick={() => setHiding(false)} className="h-9 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setHiding(true)} className="h-9 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50">
                Hide…
              </button>
              {(review.flagged || openReports.length > 0) && <Act action="dismiss" label="Keep — dismiss flag" />}
            </>
          )}
        </div>
      </form>
    </li>
  );
}

function Act({ action, label, danger }: { action: "hide" | "restore" | "dismiss"; label: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="action"
      value={action}
      disabled={pending}
      className={`h-9 rounded-lg px-3 text-sm font-semibold disabled:opacity-60 ${
        danger ? "bg-red-700 text-white hover:bg-red-800" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
      }`}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>;
}
