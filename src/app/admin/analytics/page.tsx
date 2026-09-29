import type { Metadata } from "next";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { getAnalytics, parseRange, todayDhaka } from "@/lib/admin/analytics";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Analytics · Admin · MedLife" };

export default async function AdminAnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  await requireRole("admin", "/admin/analytics");
  const sp = await searchParams;
  const { from, to } = parseRange(typeof sp.from === "string" ? sp.from : null, typeof sp.to === "string" ? sp.to : null);
  const data = await getAnalytics(from, to);

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Analytics</h1>
        <p className="mt-1 text-slate-600">Bookings, visits, cancellations, revenue and the busiest doctors and specialties.</p>
      </div>
      {data ? (
        <AnalyticsDashboard initial={data} today={todayDhaka()} />
      ) : (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Analytics aren&apos;t available yet. Run the M13 admin-panel migration in Supabase, then reload.
        </p>
      )}
    </div>
  );
}
