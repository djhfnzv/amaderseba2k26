import { StarRating } from "@/components/reviews/stars";
import { MIN_REVIEWS_FOR_AVERAGE, shownAverage } from "@/lib/reviews/constants";
import type { DoctorRatingStats } from "@/types/database";

/** Big average + 5→1 star breakdown. */
export function RatingSummary({ stats }: { stats: DoctorRatingStats | null }) {
  const count = stats?.review_count ?? 0;
  const avg = shownAverage(stats);
  const rows = [5, 4, 3, 2, 1].map((star) => {
    const n = stats ? Number(stats[`count_${star}` as keyof DoctorRatingStats] ?? 0) : 0;
    return { star, n, pct: count ? Math.round((n / count) * 100) : 0 };
  });

  return (
    <div className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
      <div className="text-center sm:text-left">
        {avg != null ? (
          <>
            <p className="text-4xl font-bold tracking-tight text-slate-900">{avg.toFixed(1)}</p>
            <StarRating value={avg} size="md" className="mt-1" />
            <p className="mt-1 text-sm text-slate-500">
              {count} review{count === 1 ? "" : "s"}
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-slate-900">New doctor</p>
            <p className="mt-1 text-sm text-slate-500">
              {count === 0
                ? "No reviews yet"
                : `${count} review${count === 1 ? "" : "s"} · rating shows from ${MIN_REVIEWS_FOR_AVERAGE}`}
            </p>
          </>
        )}
      </div>
      <ul className="flex flex-col gap-1.5" aria-label="Rating breakdown">
        {rows.map((r) => (
          <li key={r.star} className="flex items-center gap-2 text-sm">
            <span className="w-8 shrink-0 text-slate-600">{r.star}★</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span
                className="block h-full origin-left rounded-full bg-amber-400 transition-[width] duration-700 ease-out"
                style={{ width: `${r.pct}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-slate-500 tabular-nums">{r.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
