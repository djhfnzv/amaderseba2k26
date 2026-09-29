import type { Metadata } from "next";
import Link from "next/link";
import { AccessHistoryList } from "@/components/audit/access-history-list";
import { ACCESS_PAGE_SIZE } from "@/lib/audit/constants";
import { listMyRecordAccess } from "@/lib/audit/queries";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Access history · MedLife" };

export default async function AccessHistoryPage({ searchParams }: PageProps<"/patient/access-history">) {
  await requireRole("patient", "/patient/access-history");
  const { page: raw } = await searchParams;
  const page = Math.max(1, Math.min(500, Number(raw) || 1));
  const { rows, total } = await listMyRecordAccess(page, ACCESS_PAGE_SIZE);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/patient/records" className="text-sm font-medium text-teal-700 hover:underline">
        ← Medical records
      </Link>
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Access history</h1>
        <p className="mt-1 text-slate-600">
          Every time a doctor or MedLife staff opens your health profile, reports or prescriptions, it&apos;s recorded here.
          Only doctors you&apos;ve booked can see your records.
        </p>
      </div>

      <AccessHistoryList initial={{ rows, total, page, pages: Math.max(1, Math.ceil(total / ACCESS_PAGE_SIZE)) }} />

      <p className="text-xs text-slate-500">
        Something look wrong? Contact MedLife support — we keep a full, tamper-proof log of every access.
      </p>
    </div>
  );
}
