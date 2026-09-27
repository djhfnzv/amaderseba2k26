import type { Metadata } from "next";
import { LocalTime } from "@/components/ui/local-time";
import { requireRole } from "@/lib/auth/guards";
import { formatFee } from "@/lib/doctor/constants";
import { getPlatformSettings } from "@/lib/payments/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Earnings · MedLife" };

const PAYOUT_METHOD: Record<string, string> = { bank: "Bank transfer", bkash: "bKash", nagad: "Nagad", cash: "Cash", other: "Other" };

/** FR-D-15: earnings dashboard and payout history. */
export default async function DoctorEarningsPage() {
  const user = await requireRole("doctor", "/doctor/earnings");
  const supabase = await createClient();

  const [{ data: summaryRows }, { data: payments }, { data: payouts }, settings] = await Promise.all([
    supabase.rpc("doctor_earnings", { p_doctor: user.id }),
    supabase
      .from("payments")
      .select("id, appointment_id, patient_id, amount, commission_amount, doctor_amount, paid_at, tran_id")
      .eq("doctor_id", user.id)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(50),
    supabase.from("payouts").select("*").eq("doctor_id", user.id).order("paid_at", { ascending: false }).limit(50),
    getPlatformSettings(),
  ]);
  const s = summaryRows?.[0] ?? { gross: 0, commission: 0, refunded: 0, net: 0, paid_out: 0, balance: 0 };

  // Patient names and refunds for the listed payments.
  const patientIds = [...new Set((payments ?? []).map((p) => p.patient_id))];
  const paymentIds = (payments ?? []).map((p) => p.id);
  const [{ data: patients }, { data: refunds }] = await Promise.all([
    patientIds.length ? supabase.from("users").select("id, full_name, email").in("id", patientIds) : Promise.resolve({ data: [] }),
    paymentIds.length
      ? supabase.from("refunds").select("payment_id, amount, status").in("payment_id", paymentIds).eq("status", "succeeded")
      : Promise.resolve({ data: [] }),
  ]);
  const nameBy = new Map((patients ?? []).map((p) => [p.id, p.full_name || p.email]));
  const refundedBy = new Map<string, number>();
  for (const r of refunds ?? []) refundedBy.set(r.payment_id, (refundedBy.get(r.payment_id) ?? 0) + Number(r.amount));

  const cards = [
    { label: "Available balance", value: s.balance, highlight: true, sub: "Earned minus payouts received" },
    { label: "Your earnings", value: s.net, sub: `After ${settings.commission_percent}% platform fee and refunds` },
    { label: "Paid out to you", value: s.paid_out },
    { label: "Collected from patients", value: s.gross, sub: `Platform fee ${formatFee(s.commission)}` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Earnings</h1>
        <p className="mt-1 text-slate-600">
          Online payments for your consultations. Visits paid at your chamber aren&apos;t included.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 @5xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl border p-5 ${c.highlight ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white"}`}>
            <p className="text-sm font-medium text-slate-600">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{formatFee(c.value)}</p>
            {c.sub && <p className="mt-1 text-xs text-slate-500">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-[minmax(0,1fr)_22rem] @5xl:gap-8">
        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Recent payments</h2>
          {payments?.length ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Date</th>
                    <th scope="col" className="px-4 py-2.5">Patient</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Paid</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Fee</th>
                    <th scope="col" className="px-4 py-2.5 text-right">You get</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {payments.map((p) => {
                    const refunded = refundedBy.get(p.id) ?? 0;
                    return (
                      <tr key={p.id}>
                        <td className="px-4 py-3 text-slate-600">{p.paid_at && <LocalTime iso={p.paid_at} format="date" />}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{nameBy.get(p.patient_id) ?? "Patient"}</td>
                        <td className="px-4 py-3 text-right">{formatFee(p.amount)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">− {formatFee(p.commission_amount)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatFee(p.doctor_amount)}
                          {refunded > 0 && <span className="block text-xs font-normal text-red-700">{formatFee(refunded)} refunded</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              No online payments yet.
            </p>
          )}
        </section>

        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Payouts</h2>
          {payouts?.length ? (
            <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white text-sm">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium text-slate-900">{formatFee(p.amount)}</p>
                    <p className="text-slate-500">
                      {PAYOUT_METHOD[p.method]}
                      {p.reference && ` · ${p.reference}`}
                    </p>
                  </div>
                  <span className="text-slate-500">
                    <LocalTime iso={p.paid_at} format="date" />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              No payouts yet. MedLife transfers your balance to you regularly.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
