import type { Metadata } from "next";
import Link from "next/link";
import { ModerationCard } from "@/components/reviews/moderation-card";
import { requireRole } from "@/lib/auth/guards";
import { listForModeration, moderationCounts, type ModerationTab } from "@/lib/reviews/queries";

export const metadata: Metadata = { title: "Reviews · Admin · MedLife" };

const TABS: { value: ModerationTab; label: string }[] = [
  { value: "queue", label: "Needs review" },
  { value: "hidden", label: "Hidden" },
  { value: "all", label: "All reviews" },
];

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requireRole("admin", "/admin/reviews");
  const { tab: raw } = await searchParams;
  const tab = TABS.find((t) => t.value === raw)?.value ?? "queue";
  const [rows, counts] = await Promise.all([listForModeration(tab), moderationCounts()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Reviews</h1>
        <p className="mt-1 text-slate-600">
          Reviews go live straight away. Ones with links, contact details or possible abuse — and ones doctors report — land here.
        </p>
      </div>

      <nav aria-label="Review lists" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 sm:self-start">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/reviews?tab=${t.value}`}
            aria-current={t.value === tab ? "page" : undefined}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${t.value === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            {t.label}
            {t.value !== "all" && <span className="ml-1 text-slate-400">{counts[t.value]}</span>}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          {tab === "queue" ? "Nothing to review. 🎉" : tab === "hidden" ? "No hidden reviews." : "No reviews yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <ModerationCard key={r.id} review={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
