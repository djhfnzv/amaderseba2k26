import { StarRating } from "@/components/reviews/stars";
import { LocalTime } from "@/components/ui/local-time";
import { authorName, RATING_LABEL } from "@/lib/reviews/constants";
import type { PublicReview } from "@/types/database";

/** One review with the doctor's reply underneath (no patient identity). */
export function ReviewItem({
  review,
  doctorName,
  zone,
  children,
}: {
  review: PublicReview;
  doctorName?: string;
  zone?: string;
  /** Extra controls (doctor reply form, report link…). */
  children?: React.ReactNode;
}) {
  const name = authorName(review.author);
  return (
    <article className="flex gap-3">
      <span
        aria-hidden="true"
        className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
          review.author ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-500"
        }`}
      >
        {review.author ? review.author.slice(0, 1).toUpperCase() : "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="font-medium text-slate-900">{name}</p>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
            {review.consultation_type === "online" ? "Video visit" : "Chamber visit"}
          </span>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
          <StarRating value={review.rating} size="sm" />
          <span className="font-medium text-slate-700">{RATING_LABEL[review.rating]}</span>
          <span className="text-slate-400">·</span>
          <LocalTime iso={review.created_at} format="date" fallbackZone={zone} className="text-slate-500" />
          {review.edited_at && <span className="text-xs text-slate-400">(edited)</span>}
        </p>
        {review.tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Highlights">
            {review.tags.map((t) => (
              <li key={t} className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
                {t}
              </li>
            ))}
          </ul>
        )}
        {review.body && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">{review.body}</p>}

        {review.reply_body && (
          <div className="mt-3 rounded-xl border-l-4 border-teal-600 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">
              Reply from {doctorName ?? "the doctor"}
              {review.replied_at && (
                <>
                  {" · "}
                  <LocalTime iso={review.replied_at} format="date" fallbackZone={zone} className="font-normal text-slate-500" />
                </>
              )}
            </p>
            <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{review.reply_body}</p>
          </div>
        )}
        {children}
      </div>
    </article>
  );
}
