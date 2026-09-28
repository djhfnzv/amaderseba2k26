"use client";

import { useState, useTransition } from "react";
import { ReviewItem } from "@/components/reviews/review-item";
import { REVIEW_SORTS, type ReviewSort } from "@/lib/reviews/constants";
import type { PublicReview } from "@/types/database";

/** Reviews on a doctor's page: sort + "show more", loaded as JSON. */
export function PublicReviews({
  doctorId,
  doctorName,
  initial,
  total: initialTotal,
}: {
  doctorId: string;
  doctorName: string;
  initial: PublicReview[];
  total: number;
}) {
  const [reviews, setReviews] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function load(nextSort: ReviewSort, offset: number) {
    setError(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/doctors/${doctorId}/reviews?sort=${nextSort}&offset=${offset}`);
        if (!res.ok) throw new Error(String(res.status));
        const page = (await res.json()) as { reviews: PublicReview[]; total: number };
        setReviews((list) => (offset === 0 ? page.reviews : [...list, ...page.reviews.filter((r) => !list.some((x) => x.id === r.id))]));
        setTotal(page.total);
      } catch {
        setError(true);
      }
    });
  }

  if (total === 0) {
    return <p className="text-sm text-slate-600">No reviews yet. Patients can review {doctorName} after a completed visit.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Showing {reviews.length} of {total}
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Sort
          <select
            value={sort}
            onChange={(e) => {
              const next = e.target.value as ReviewSort;
              setSort(next);
              load(next, 0);
            }}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
          >
            {REVIEW_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className={`flex flex-col divide-y divide-slate-100 transition-opacity ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
        {reviews.map((r, i) => (
          <li key={r.id} className="animate-fade-up py-4 first:pt-0" style={{ animationDelay: `${Math.min(i % 5, 4) * 40}ms` }}>
            <ReviewItem review={r} doctorName={doctorName} />
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-red-700">Couldn&apos;t load reviews. Please try again.</p>}
      {reviews.length < total && (
        <button
          type="button"
          onClick={() => load(sort, reviews.length)}
          disabled={pending}
          className="h-10 self-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          {pending ? "Loading…" : "Show more reviews"}
        </button>
      )}
    </div>
  );
}
