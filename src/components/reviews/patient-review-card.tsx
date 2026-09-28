"use client";

import { useState } from "react";
import { ReviewForm } from "@/components/reviews/review-form";
import { ReviewItem } from "@/components/reviews/review-item";
import type { ConsultationType, Review } from "@/types/database";

/**
 * The patient's review on a completed appointment: the form if there is none
 * yet, otherwise their review (with Edit while the 7-day window is open).
 */
export function PatientReviewCard({
  appointmentId,
  doctorName,
  consultationType,
  review,
  canWrite,
  canEdit,
}: {
  appointmentId: string;
  doctorName: string;
  consultationType: ConsultationType;
  review: Review | null;
  /** Still inside the 30-day window. */
  canWrite: boolean;
  /** Posted less than 7 days ago and not hidden. */
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // Close the editor once the saved review comes back from the server.
  const [seenVersion, setSeenVersion] = useState(review?.updated_at ?? null);
  if ((review?.updated_at ?? null) !== seenVersion) {
    setSeenVersion(review?.updated_at ?? null);
    setEditing(false);
  }

  if (!review) {
    return canWrite ? (
      <ReviewForm appointmentId={appointmentId} doctorName={doctorName} existing={null} />
    ) : (
      <p className="text-sm text-slate-600">The 30-day window for reviewing this visit has closed.</p>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <ReviewForm appointmentId={appointmentId} doctorName={doctorName} existing={review} />
        <button type="button" onClick={() => setEditing(false)} className="self-start text-sm font-medium text-slate-600 hover:underline">
          Cancel editing
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {review.status === "hidden" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          A moderator hid this review from the public page.
          {review.hidden_reason && <> Reason: {review.hidden_reason}</>}
        </p>
      )}
      <ReviewItem
        review={{
          id: review.id,
          rating: review.rating,
          tags: review.tags,
          body: review.body,
          author: review.is_anonymous ? null : review.author_label,
          reply_body: review.reply_body,
          replied_at: review.replied_at,
          created_at: review.created_at,
          edited_at: review.edited_at,
          consultation_type: consultationType,
        }}
        doctorName={doctorName}
      />
      <p className="text-xs text-slate-500">
        {review.is_anonymous ? "Shown as “Anonymous patient”." : `Shown as “${review.author_label ?? "you"}”.`}{" "}
        {canEdit ? "You can edit it for 7 days after posting." : review.status === "published" ? "Reviews can be edited for 7 days after posting." : ""}
      </p>
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="h-10 self-start rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Edit review
        </button>
      )}
    </div>
  );
}
