"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { STAR_PATH } from "@/components/reviews/stars";
import { Alert } from "@/components/ui/alert";
import { deleteReview, saveReview } from "@/lib/reviews/actions";
import { RATING_LABEL, REVIEW_MAX_LENGTH, REVIEW_TAGS } from "@/lib/reviews/constants";
import type { Review } from "@/types/database";

/** Write or edit a review for a completed appointment. */
export function ReviewForm({
  appointmentId,
  doctorName,
  existing,
}: {
  appointmentId: string;
  doctorName: string;
  existing: Review | null;
}) {
  const [state, action] = useActionState(saveReview, undefined);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [body, setBody] = useState(existing?.body ?? "");
  const shown = hover || rating;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="rating" value={rating || ""} />

      <fieldset>
        <legend className="text-sm font-medium text-slate-800">How was your visit with {doctorName}?</legend>
        <div className="mt-2 flex items-center gap-3">
          <div role="radiogroup" aria-label="Rating" className="flex" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? "s" : ""} — ${RATING_LABEL[n]}`}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setRating((r) => Math.min(5, (r || 0) + 1));
                  } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                    e.preventDefault();
                    setRating((r) => Math.max(1, (r || 2) - 1));
                  }
                }}
                className="rounded-md p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className={`size-9 transition-[color,scale] duration-150 ${n <= shown ? "scale-105 text-amber-400" : "text-slate-200 hover:text-amber-200"}`}
                  fill="currentColor"
                >
                  <path d={STAR_PATH} />
                </svg>
              </button>
            ))}
          </div>
          <span className="min-w-20 text-sm font-semibold text-slate-700" aria-live="polite">
            {shown ? RATING_LABEL[shown] : ""}
          </span>
        </div>
        {state?.fieldErrors?.rating && <p className="mt-1 text-xs text-red-600">Choose a star rating.</p>}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-slate-800">What stood out? <span className="font-normal text-slate-500">(optional)</span></legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {REVIEW_TAGS.map((t) => {
            const on = tags.includes(t);
            return (
              <label
                key={t}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600 ${
                  on ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-teal-400"
                }`}
              >
                <input
                  type="checkbox"
                  name="tags"
                  value={t}
                  checked={on}
                  onChange={() => setTags((list) => (on ? list.filter((x) => x !== t) : [...list, t]))}
                  className="sr-only"
                />
                {t}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-body" className="text-sm font-medium text-slate-800">
          Your review <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <textarea
          id="review-body"
          name="body"
          rows={4}
          maxLength={REVIEW_MAX_LENGTH}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share what helped, so other patients can choose. Please don't include phone numbers or personal medical details."
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
        />
        <p className="text-right text-xs text-slate-500 tabular-nums">
          {body.length}/{REVIEW_MAX_LENGTH}
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="anonymous" defaultChecked={existing?.is_anonymous ?? false} className="mt-0.5 size-4 accent-teal-700" />
        <span>
          Post anonymously <span className="text-slate-500">— otherwise your first name and last initial are shown.</span>
        </span>
      </label>

      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <Submit label={existing ? "Update review" : "Post review"} disabled={!rating} />
        {existing && (
          <button
            type="submit"
            formAction={deleteReview}
            name="id"
            value={existing.id}
            formNoValidate
            onClick={(e) => {
              if (!confirm("Delete your review? This can't be undone.")) e.preventDefault();
            }}
            className="h-11 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete review
          </button>
        )}
      </div>
    </form>
  );
}

function Submit({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
