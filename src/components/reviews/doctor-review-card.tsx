"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ReviewItem } from "@/components/reviews/review-item";
import { LocalTime } from "@/components/ui/local-time";
import { replyToReview, reportReview } from "@/lib/reviews/actions";
import type { DoctorReview } from "@/types/database";

/** A review on the doctor's Reviews page: reply (FR-D-16) and report. */
export function DoctorReviewCard({ review, doctorName, zone }: { review: DoctorReview; doctorName: string; zone: string }) {
  const [mode, setMode] = useState<"view" | "reply" | "report">("view");
  const hidden = review.status === "hidden";

  return (
    <li className={`rounded-2xl border bg-white p-5 ${hidden ? "border-amber-200" : "border-slate-200"}`}>
      <p className="mb-3 text-xs text-slate-500">
        Visit on <LocalTime iso={review.visit_date} format="date" fallbackZone={zone} />
        {hidden && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Hidden by moderator</span>}
        {review.reported && !hidden && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">Reported</span>}
      </p>
      <ReviewItem review={review} doctorName="you" zone={zone}>
        {!hidden && mode === "view" && (
          <div className="mt-3 flex flex-wrap gap-1">
            <button type="button" onClick={() => setMode("reply")} className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50">
              {review.reply_body ? "Edit reply" : "Reply"}
            </button>
            {!review.reported && (
              <button type="button" onClick={() => setMode("report")} className="rounded-md px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100">
                Report
              </button>
            )}
          </div>
        )}
        {mode === "reply" && <ReplyForm review={review} doctorName={doctorName} onClose={() => setMode("view")} />}
        {mode === "report" && <ReportForm reviewId={review.id} onClose={() => setMode("view")} />}
        {hidden && review.hidden_reason && <p className="mt-2 text-xs text-amber-800">Reason: {review.hidden_reason}</p>}
      </ReviewItem>
    </li>
  );
}

function ReplyForm({ review, doctorName, onClose }: { review: DoctorReview; doctorName: string; onClose: () => void }) {
  const [state, action] = useActionState(replyToReview, undefined);
  const [text, setText] = useState(state?.values?.reply ?? review.reply_body ?? "");
  if (state?.message) {
    return (
      <p className="mt-3 animate-fade-in text-sm text-emerald-700">
        {state.message}{" "}
        <button type="button" onClick={onClose} className="font-medium underline">
          Close
        </button>
      </p>
    );
  }
  return (
    <form action={action} className="mt-3 flex animate-fade-in flex-col gap-2">
      <input type="hidden" name="id" value={review.id} />
      <label htmlFor={`reply-${review.id}`} className="text-sm font-medium text-slate-800">
        Public reply as {doctorName}
      </label>
      <textarea
        id={`reply-${review.id}`}
        name="reply"
        rows={3}
        maxLength={1000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Thank the patient, or respond to their feedback. Never include medical details."
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
      />
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <Submit label={review.reply_body ? "Update reply" : "Post reply"} />
        {review.reply_body && (
          <button
            type="submit"
            name="remove"
            value="1"
            className="h-9 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Remove reply
          </button>
        )}
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ReportForm({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const [state, action] = useActionState(reportReview, undefined);
  if (state?.message) return <p className="mt-3 animate-fade-in text-sm text-emerald-700">{state.message}</p>;
  return (
    <form action={action} className="mt-3 flex animate-fade-in flex-col gap-2 rounded-xl bg-slate-50 p-3">
      <input type="hidden" name="id" value={reviewId} />
      <label htmlFor={`report-${reviewId}`} className="text-sm font-medium text-slate-800">
        What&apos;s wrong with this review?
      </label>
      <input
        id={`report-${reviewId}`}
        name="reason"
        required
        minLength={3}
        maxLength={500}
        defaultValue={state?.values?.reason}
        placeholder="e.g. Abusive language, not a real patient, shares private details"
        className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
      />
      <p className="text-xs text-slate-500">An admin checks reports. Reviews can&apos;t be removed just for being negative.</p>
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
      <div className="flex gap-2">
        <Submit label="Send report" />
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-9 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
      {pending ? "Saving…" : label}
    </button>
  );
}
