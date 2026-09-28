import type { Metadata } from "next";
import Link from "next/link";
import { DoctorReviewCard } from "@/components/reviews/doctor-review-card";
import { RatingSummary } from "@/components/reviews/rating-summary";
import { requireRole } from "@/lib/auth/guards";
import { getOrCreateOwnProfile } from "@/lib/doctor/queries";
import { getRatingStats, listMyDoctorReviews } from "@/lib/reviews/queries";

export const metadata: Metadata = { title: "Reviews · MedLife" };

const TABS = [
  { value: "all", label: "All" },
  { value: "unreplied", label: "Needs a reply" },
] as const;

export default async function DoctorReviewsPage({ searchParams }: PageProps<"/doctor/reviews">) {
  const user = await requireRole("doctor", "/doctor/reviews");
  const profile = await getOrCreateOwnProfile(user);
  const { show } = await searchParams;
  const tab = show === "unreplied" ? "unreplied" : "all";
  const [stats, reviews] = await Promise.all([getRatingStats(user.id, true), listMyDoctorReviews(tab)]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Reviews</h1>
          <p className="mt-1 text-slate-600">What patients say after their visits. Replies are public.</p>
        </div>
        <Link href={`/doctors/${profile.slug}#reviews`} target="_blank" className="text-sm font-medium text-teal-700 hover:underline">
          See them on your public page →
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <RatingSummary stats={stats} />
      </section>

      <nav aria-label="Filter reviews" className="flex gap-1 rounded-lg bg-slate-100 p-1 sm:self-start">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "all" ? "/doctor/reviews" : `/doctor/reviews?show=${t.value}`}
            aria-current={t.value === tab ? "page" : undefined}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${t.value === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {reviews.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          {tab === "unreplied" ? "You've replied to every review." : "No reviews yet. Patients are asked to review after a completed visit."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reviews.map((r) => (
            <DoctorReviewCard key={r.id} review={r} doctorName={profile.display_name} zone={profile.timezone} />
          ))}
        </ul>
      )}
    </div>
  );
}
