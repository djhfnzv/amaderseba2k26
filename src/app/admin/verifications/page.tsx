import type { Metadata } from "next";
import Link from "next/link";
import { StatusPill } from "@/components/verification/status-pill";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import { listRequests } from "@/lib/verification/queries";
import type { VerificationStatus } from "@/types/database";

export const metadata: Metadata = { title: "Verifications · Admin · MedLife" };

const TABS: { value: VerificationStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export default async function VerificationQueuePage({ searchParams }: PageProps<"/admin/verifications">) {
  await requireRole("admin", "/admin/verifications");
  const { status: raw } = await searchParams;
  const status = TABS.find((t) => t.value === raw)?.value ?? "pending";
  const items = await listRequests(status);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Doctor verifications</h1>
        <p className="mt-1 text-slate-600">Review license, degree and ID documents before a doctor goes public.</p>
      </div>

      <nav aria-label="Filter by status" className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 sm:self-start">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/verifications?status=${t.value}`}
            aria-current={t.value === status ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
              t.value === status ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          {status === "pending" ? "No requests waiting for review. 🎉" : "Nothing here yet."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/verifications/${r.id}`}
                className="flex flex-col gap-2 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{r.doctor.display_name}</p>
                    <StatusPill status={r.status} />
                  </div>
                  <p className="truncate text-sm text-slate-600">
                    {[r.email, r.doctor.license_number && `License ${r.doctor.license_number}`, r.doctor.headline]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex gap-4 text-sm text-slate-500 sm:text-right">
                  <span>{r.documentCount} docs</span>
                  <span>
                    {r.status === "pending" && r.submitted_at
                      ? `Submitted ${formatDateTime(r.submitted_at)}`
                      : r.reviewed_at
                        ? `Reviewed ${formatDateTime(r.reviewed_at)}`
                        : ""}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
