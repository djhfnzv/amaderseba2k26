import type { Metadata } from "next";
import Link from "next/link";
import { InlineAction } from "@/components/ui/inline-action";
import { requireRole } from "@/lib/auth/guards";
import { LAB_TEST_CATEGORIES } from "@/lib/prescriptions/constants";
import { createClient } from "@/lib/supabase/server";
import { setLabTestActive, setSpecialtyActive } from "./actions";
import { AddLabTestForm, AddSpecialtyForm, EditSpecialtyForm } from "./forms";

export const metadata: Metadata = { title: "Specialties & tests · Admin · MedLife" };

export default async function AdminCatalogPage() {
  await requireRole("admin", "/admin/catalog");
  const supabase = await createClient();
  const [{ data: specialties }, { data: links }, { data: tests }] = await Promise.all([
    supabase.from("specialties").select("*").order("name"),
    supabase.from("doctor_specialties").select("specialty_id"),
    supabase.from("lab_tests").select("*").order("sort_order").order("name"),
  ]);
  const doctorCount = new Map<number, number>();
  for (const l of links ?? []) doctorCount.set(l.specialty_id, (doctorCount.get(l.specialty_id) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Specialties & tests</h1>
        <p className="mt-1 text-slate-600">
          What doctors can list on their profile, and the quick-pick tests in the prescription editor. The medicine list is under{" "}
          <Link href="/admin/medicines" className="font-medium text-teal-700 hover:underline">Medicines</Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-2">
        <section className="flex min-w-0 animate-fade-up flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Specialties ({specialties?.length ?? 0})</h2>
            <p className="text-sm text-slate-600">Hidden specialties disappear from search and the doctor profile editor; doctors keep them.</p>
          </div>
          <AddSpecialtyForm />
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {(specialties ?? []).map((s, i) => (
              <li
                key={s.id}
                style={{ animationDelay: `${Math.min(i, 15) * 18}ms` }}
                className={`animate-row-in p-3 ${s.is_active ? "" : "bg-slate-50"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`font-medium ${s.is_active ? "text-slate-900" : "text-slate-500 line-through decoration-slate-300"}`}>
                      {s.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      /{s.slug} · {doctorCount.get(s.id) ?? 0} doctor{doctorCount.get(s.id) === 1 ? "" : "s"}
                      {s.description ? ` · ${s.description}` : ""}
                    </p>
                  </div>
                  <InlineAction
                    action={setSpecialtyActive}
                    fields={{ id: String(s.id), active: String(!s.is_active) }}
                    label={s.is_active ? "Hide" : "Show"}
                    tone={s.is_active ? "danger" : "default"}
                    confirmText={s.is_active ? `Hide ${s.name} from search and the profile editor?` : undefined}
                    pendingLabel="…"
                  />
                </div>
                <details className="group">
                  <summary className="mt-1 cursor-pointer list-none text-xs font-medium text-teal-700 hover:underline">
                    <span className="group-open:hidden">Edit</span>
                    <span className="hidden group-open:inline">Close</span>
                  </summary>
                  <EditSpecialtyForm id={s.id} name={s.name} description={s.description} />
                </details>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex min-w-0 animate-fade-up flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Lab tests ({tests?.length ?? 0})</h2>
            <p className="text-sm text-slate-600">Shown as quick picks when doctors add investigations. Doctors can still type any test.</p>
          </div>
          <AddLabTestForm />
          {LAB_TEST_CATEGORIES.map((cat) => {
            const list = (tests ?? []).filter((t) => t.category === cat.value);
            if (!list.length) return null;
            return (
              <div key={cat.value}>
                <h3 className="mb-2 text-xs font-bold tracking-wide text-slate-500 uppercase">{cat.label}</h3>
                <ul className="flex flex-wrap gap-2">
                  {list.map((t) => (
                    <li
                      key={t.id}
                      className={`inline-flex animate-scale-in items-center gap-1 rounded-full border py-0.5 pr-1 pl-3 text-sm ${
                        t.is_active ? "border-slate-200 bg-white text-slate-900" : "border-dashed border-slate-300 bg-slate-50 text-slate-400"
                      }`}
                    >
                      {t.name}
                      <InlineAction
                        action={setLabTestActive}
                        fields={{ id: String(t.id), active: String(!t.is_active) }}
                        label={t.is_active ? "✕" : "+"}
                        ariaLabel={t.is_active ? `Hide ${t.name}` : `Show ${t.name}`}
                        tone={t.is_active ? "danger" : "default"}
                        pendingLabel="…"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
