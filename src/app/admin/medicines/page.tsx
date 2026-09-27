import type { Metadata } from "next";
import Link from "next/link";
import { InlineAction } from "@/components/ui/inline-action";
import { requireRole } from "@/lib/auth/guards";
import { medicineLabel } from "@/lib/prescriptions/constants";
import { createClient } from "@/lib/supabase/server";
import { updateMedicineFlag } from "./actions";
import { AddMedicineForm, ImportMedicinesForm } from "./forms";

export const metadata: Metadata = { title: "Medicines · Admin · MedLife" };

const PAGE_SIZE = 50;
const FILTERS = [
  { value: "", label: "All" },
  { value: "controlled", label: "Controlled" },
  { value: "custom", label: "Added by doctors" },
  { value: "inactive", label: "Hidden" },
] as const;

export default async function AdminMedicinesPage({ searchParams }: PageProps<"/admin/medicines">) {
  await requireRole("admin", "/admin/medicines");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.replace(/[%_,()"]/g, " ").trim().slice(0, 60) : "";
  const filter = FILTERS.find((f) => f.value === sp.filter)?.value ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("medicines")
    .select("*", { count: "exact" })
    .order("generic_name")
    .order("strength")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`generic_name.ilike."%${q}%",brand_name.ilike."%${q}%",company.ilike."%${q}%"`);
  if (filter === "controlled") query = query.eq("is_controlled", true);
  if (filter === "custom") query = query.eq("is_custom", true);
  if (filter === "inactive") query = query.eq("is_active", false);
  const { data: medicines, count } = await query;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const url = (p: Record<string, string | number>) => {
    const params = new URLSearchParams();
    const merged = { q, filter, page: 1, ...p };
    Object.entries(merged).forEach(([k, v]) => v && !(k === "page" && v === 1) && params.set(k, String(v)));
    const qs = params.toString();
    return qs ? `/admin/medicines?${qs}` : "/admin/medicines";
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Medicines</h1>
        <p className="mt-1 text-slate-600">
          The list doctors pick from when prescribing. Controlled drugs are blocked in online consultations.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex min-w-0 flex-col gap-4">
          <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
            {filter && <input type="hidden" name="filter" value={filter} />}
            <label htmlFor="q" className="sr-only">Search medicines</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Generic, brand or company"
              className="h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-teal-600"
            />
            <button type="submit" className="h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
              Search
            </button>
          </form>

          <nav aria-label="Filter" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 sm:self-start">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={url({ filter: f.value })}
                aria-current={f.value === filter ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${f.value === filter ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                {f.label}
              </Link>
            ))}
          </nav>

          <p className="text-sm text-slate-600">{total} medicine{total === 1 ? "" : "s"}</p>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2 font-semibold">Medicine</th>
                  <th className="px-4 py-2 font-semibold">Company</th>
                  <th className="px-4 py-2 font-semibold">Flags</th>
                  <th className="px-4 py-2 font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(medicines ?? []).map((m) => (
                  <tr key={m.id} className={m.is_active ? "" : "bg-slate-50 text-slate-500"}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{medicineLabel(m)}</p>
                      {m.brand_name && <p className="text-xs text-slate-500">{m.generic_name}</p>}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{m.company ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className="flex flex-wrap gap-1">
                        {m.is_controlled && <Badge tone="bg-red-50 text-red-700">Controlled</Badge>}
                        {m.is_custom && <Badge tone="bg-violet-50 text-violet-700">Doctor-added</Badge>}
                        {!m.is_active && <Badge tone="bg-slate-200 text-slate-700">Hidden</Badge>}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="flex justify-end gap-1">
                        <InlineAction
                          action={updateMedicineFlag}
                          fields={{ id: m.id, flag: "is_controlled", value: String(!m.is_controlled) }}
                          label={m.is_controlled ? "Uncontrol" : "Mark controlled"}
                          pendingLabel="…"
                        />
                        <InlineAction
                          action={updateMedicineFlag}
                          fields={{ id: m.id, flag: "is_active", value: String(!m.is_active) }}
                          label={m.is_active ? "Hide" : "Show"}
                          tone={m.is_active ? "danger" : "default"}
                          pendingLabel="…"
                        />
                      </span>
                    </td>
                  </tr>
                ))}
                {!medicines?.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No medicines match.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-between text-sm">
              {page > 1 ? <Link href={url({ page: page - 1 })} className="font-medium text-teal-700 hover:underline">← Previous</Link> : <span />}
              <span className="text-slate-600">Page {page} of {pages}</span>
              {page < pages ? <Link href={url({ page: page + 1 })} className="font-medium text-teal-700 hover:underline">Next →</Link> : <span />}
            </nav>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-6 @4xl:self-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Add a medicine</h2>
            <AddMedicineForm />
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Import CSV</h2>
            <ImportMedicinesForm />
          </section>
        </aside>
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>{children}</span>;
}
