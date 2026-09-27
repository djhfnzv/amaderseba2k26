import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { LocalTime } from "@/components/ui/local-time";
import { site } from "@/lib/site";
import { createPublicClient } from "@/lib/supabase/public";
import type { VerifyResult } from "@/types/database";

export const metadata: Metadata = {
  title: `Prescription check · ${site.name}`,
  robots: { index: false, follow: false },
};

async function verify(code: string): Promise<VerifyResult> {
  if (!/^[A-Z0-9]{10}$/.test(code)) return { status: "invalid" };
  const { data, error } = await createPublicClient().rpc("verify_prescription", { p_code: code });
  if (error || !data) {
    if (error) console.error("[verify]", error.message);
    return { status: "invalid" };
  }
  return data;
}

const STATES = {
  valid: {
    title: "Valid prescription",
    text: "This prescription was issued and digitally signed by a verified doctor on MedLife, and it is the current version.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: "M5 12.5l4.5 4.5L19 7.5",
    iconTone: "bg-emerald-600",
  },
  superseded: {
    title: "Replaced — do not dispense",
    text: "This prescription was genuine, but the doctor has since replaced it with a newer version. Ask the patient for the latest one.",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
    icon: "M12 7.5v5.5M12 16.5v.5",
    iconTone: "bg-amber-500",
  },
  invalid: {
    title: "Not found",
    text: "We couldn't find a signed MedLife prescription with this ID. Check the ID, or treat the paper as unverified.",
    tone: "border-red-200 bg-red-50 text-red-900",
    icon: "M7.5 7.5l9 9M16.5 7.5l-9 9",
    iconTone: "bg-red-600",
  },
} as const;

export default async function VerifyCodePage({ params }: PageProps<"/verify/[code]">) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase();
  const result = await verify(code);
  const state = STATES[result.status];

  return (
    <>
      <SiteHeader />
      <main className="page-container flex flex-1 flex-col items-center py-12 sm:py-16">
        <div className="flex w-full max-w-lg flex-col gap-5">
          <section className={`animate-scale-in rounded-2xl border p-6 ${state.tone}`} role="status">
            <div className="flex items-center gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${state.iconTone}`} aria-hidden="true">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d={state.icon} />
                </svg>
              </span>
              <h1 className="text-xl font-bold">{state.title}</h1>
            </div>
            <p className="mt-3 text-sm">{state.text}</p>
            <p className="mt-3 font-mono text-sm">ID: {code || "—"}</p>
          </section>

          {result.status !== "invalid" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Item label="Doctor">
                  {result.doctor_name ?? "—"}
                  {result.doctor_degrees && <span className="block text-xs font-normal text-slate-500">{result.doctor_degrees}</span>}
                </Item>
                <Item label="Registration no.">{result.doctor_license ?? "—"}</Item>
                <Item label="Patient">
                  {result.patient_initials ?? "—"}
                  {result.patient_age && `, ${result.patient_age}`}
                </Item>
                <Item label="Signed"><LocalTime iso={result.signed_at} /></Item>
                {result.replaced_at && <Item label="Replaced"><LocalTime iso={result.replaced_at} /></Item>}
              </dl>
              <h2 className="mt-5 text-sm font-semibold text-slate-900">Medicines on this prescription</h2>
              {result.items.length ? (
                <ol className="mt-2 flex flex-col gap-1.5 text-sm">
                  {result.items.map((it, i) => (
                    <li key={i} className="rounded-lg bg-slate-50 px-3 py-2">
                      <span className="font-medium text-slate-900">{i + 1}. {it.name}</span>
                      {(it.dose || it.duration) && (
                        <span className="block text-slate-600">{[it.dose, it.duration].filter(Boolean).join(" · ")}</span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-slate-600">No medicines (tests or advice only).</p>
              )}
              <p className="mt-4 text-xs text-slate-500">
                Compare these with the paper. For privacy, only the patient&apos;s initials are shown.
              </p>
            </section>
          )}

          <Link href="/verify" className="text-center text-sm font-medium text-teal-700 hover:underline">
            Check another prescription
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{children}</dd>
    </div>
  );
}
