import type { Metadata } from "next";
import Link from "next/link";
import { ComplaintStatusPill } from "@/components/complaints/thread";
import { LocalTime } from "@/components/ui/local-time";
import { requireRole } from "@/lib/auth/guards";
import { CATEGORY_LABEL, COMPLAINT_TABS, PRIORITY_TONE } from "@/lib/complaints/constants";
import { listComplaintQueue } from "@/lib/complaints/queries";

export const metadata: Metadata = { title: "Complaints · Admin · MedLife" };

export default async function AdminComplaintsPage({ searchParams }: PageProps<"/admin/complaints">) {
  await requireRole("admin", "/admin/complaints");
  const sp = await searchParams;
  const tab = COMPLAINT_TABS.find((t) => t.value === sp.tab)?.value ?? "active";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const { rows, counts } = await listComplaintQueue(tab, q);
  const href = (t: string) => `/admin/complaints?${new URLSearchParams({ tab: t, ...(q ? { q } : {}) })}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Complaints</h1>
        <p className="mt-1 text-slate-600">
          {counts.open} open · {counts.in_review} in review. Urgent and oldest first.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter complaints" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 sm:self-start">
          {COMPLAINT_TABS.map((t) => (
            <Link
              key={t.value}
              href={href(t.value)}
              aria-current={t.value === tab ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                t.value === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
              {t.value === "active" && counts.open + counts.in_review > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{counts.open + counts.in_review}</span>
              )}
            </Link>
          ))}
        </nav>
        <form method="get" role="search" className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <label htmlFor="q" className="sr-only">Search complaints</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Code or subject"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-teal-600 sm:w-56"
          />
          <button type="submit" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50">
            Search
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="animate-fade-up rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          {tab === "active" ? "Nothing waiting — all complaints are handled." : "No complaints here."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {rows.map((c, i) => (
            <li key={c.id} style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }} className="animate-row-in">
              <Link
                href={`/admin/complaints/${c.id}`}
                className="flex flex-col gap-1 p-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="w-28 shrink-0">
                  <span className="block font-mono text-xs text-slate-500">{c.code}</span>
                  <span className={`text-xs font-semibold capitalize ${PRIORITY_TONE[c.priority]}`}>
                    {c.priority === "normal" ? "" : c.priority}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{c.subject}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {c.complainant_name ?? "Deleted account"} ({c.complainant_role}) · {CATEGORY_LABEL[c.category]}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-slate-500">
                  <LocalTime iso={c.last_activity_at} format="dayMonth" />
                </span>
                <ComplaintStatusPill status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
