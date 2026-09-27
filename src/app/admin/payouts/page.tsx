import type { Metadata } from "next";
import { LocalTime } from "@/components/ui/local-time";
import { requireRole } from "@/lib/auth/guards";
import { formatFee } from "@/lib/doctor/constants";
import { createClient } from "@/lib/supabase/server";
import { PayoutForm } from "./payout-form";

export const metadata: Metadata = { title: "Payouts · Admin · MedLife" };

const METHOD: Record<string, string> = { bank: "Bank", bkash: "bKash", nagad: "Nagad", cash: "Cash", other: "Other" };

/** FR-A-09: doctor balances and payout records. */
export default async function AdminPayoutsPage() {
  await requireRole("admin", "/admin/payouts");
  const supabase = await createClient();

  // Doctors who have received at least one online payment.
  const { data: paidRows } = await supabase.from("payments").select("doctor_id").eq("status", "paid");
  const doctorIds = [...new Set((paidRows ?? []).map((r) => r.doctor_id))];

  const [{ data: profiles }, earnings, { data: payouts }] = await Promise.all([
    doctorIds.length
      ? supabase.from("doctor_profiles").select("user_id, display_name").in("user_id", doctorIds)
      : Promise.resolve({ data: [] }),
    Promise.all(doctorIds.map((id) => supabase.rpc("doctor_earnings", { p_doctor: id }).then((r) => [id, r.data?.[0]] as const))),
    supabase.from("payouts").select("*").order("paid_at", { ascending: false }).limit(50),
  ]);

  const nameBy = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name]));
  const rows = earnings
    .map(([id, e]) => ({ id, name: nameBy.get(id) ?? "Doctor", net: Number(e?.net ?? 0), paidOut: Number(e?.paid_out ?? 0), balance: Number(e?.balance ?? 0) }))
    .sort((a, b) => b.balance - a.balance);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Payouts</h1>
        <p className="mt-1 text-slate-600">
          What each doctor has earned from online payments (after commission and refunds), and transfers made to them.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:grid-cols-[minmax(0,1fr)_24rem] @5xl:gap-8">
        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Doctor balances</h2>
          {rows.length ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Doctor</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Earned</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Paid out</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                      <td className="px-4 py-3 text-right">{formatFee(r.net)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatFee(r.paidOut)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${r.balance > 0 ? "text-teal-800" : "text-slate-500"}`}>{formatFee(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">No online earnings yet.</p>
          )}

          <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Recent payouts</h2>
          {payouts?.length ? (
            <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white text-sm">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium text-slate-900">
                      {formatFee(p.amount)} → {nameBy.get(p.doctor_id) ?? "Doctor"}
                    </p>
                    <p className="text-slate-500">
                      {METHOD[p.method]}
                      {p.reference && ` · ${p.reference}`}
                      {p.note && ` · ${p.note}`}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-slate-500">
                    <LocalTime iso={p.paid_at} format="date" />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">No payouts recorded.</p>
          )}
        </section>

        <aside className="min-w-0 @4xl:self-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">Record a payout</h2>
            <p className="mb-4 text-sm text-slate-600">After you&apos;ve transferred the money, record it here so the doctor sees it.</p>
            <PayoutForm doctors={rows.filter((r) => r.balance > 0).map((r) => ({ id: r.id, name: r.name, balance: r.balance }))} />
          </section>
        </aside>
      </div>
    </div>
  );
}
