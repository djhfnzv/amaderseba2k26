import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { countPending } from "@/lib/verification/queries";

export const metadata: Metadata = { title: "Admin · MedLife" };

export default async function AdminDashboard() {
  await requireRole("admin", "/admin");
  const pending = await countPending();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Admin panel</h1>
        <p className="mt-1 text-slate-600">Operate and moderate the MedLife platform.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/verifications"
          className={`rounded-2xl border p-5 transition-shadow hover:shadow-md ${
            pending > 0 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
          }`}
        >
          <p className="text-sm font-medium text-slate-600">Doctor verifications waiting</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{pending}</p>
          <p className="mt-2 text-sm font-semibold text-teal-700">
            {pending > 0 ? "Review now →" : "Open queue →"}
          </p>
        </Link>
      </div>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-900">Coming soon</h2>
        <p className="mt-1 text-sm text-slate-600">
          User management, payments & refunds, complaints, reports and analytics.
        </p>
      </section>
    </div>
  );
}
