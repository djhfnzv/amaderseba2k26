import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/ui/local-time";
import { requireRole } from "@/lib/auth/guards";
import { formatFee } from "@/lib/doctor/constants";
import { createClient } from "@/lib/supabase/server";
import type { PaymentRowStatus } from "@/types/database";
import { catchUpRefunds } from "./actions";
import { RefundRetry } from "./refund-retry";

export const metadata: Metadata = { title: "Payments · Admin · MedLife" };

const TABS: { value: PaymentRowStatus | "all"; label: string }[] = [
  { value: "paid", label: "Paid" },
  { value: "initiated", label: "In progress" },
  { value: "failed", label: "Failed" },
  { value: "all", label: "All" },
];

const STATUS_TONE: Record<PaymentRowStatus, string> = {
  paid: "bg-emerald-100 text-emerald-900",
  initiated: "bg-amber-100 text-amber-900",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-slate-200 text-slate-700",
  expired: "bg-slate-200 text-slate-700",
};

export default async function AdminPaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  await requireRole("admin", "/admin/payments");
  const { status: raw } = await searchParams;
  const status = TABS.find((t) => t.value === raw)?.value ?? "paid";
  const supabase = await createClient();

  let q = supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(100);
  if (status !== "all") q = q.eq("status", status);

  const [{ data: payments }, { data: paidAll }, { data: refunds }] = await Promise.all([
    q,
    supabase.from("payments").select("amount, commission_amount").eq("status", "paid"),
    supabase.from("refunds").select("*").order("created_at", { ascending: false }).limit(50),
  ]);

  const ids = [...new Set((payments ?? []).flatMap((p) => [p.patient_id, p.doctor_id]))];
  const { data: people } = ids.length ? await supabase.from("users").select("id, full_name, email").in("id", ids) : { data: [] };
  const nameBy = new Map((people ?? []).map((u) => [u.id, u.full_name || u.email || "—"]));

  const collected = (paidAll ?? []).reduce((n, p) => n + Number(p.amount), 0);
  const commission = (paidAll ?? []).reduce((n, p) => n + Number(p.commission_amount ?? 0), 0);
  const refundedTotal = (refunds ?? []).filter((r) => r.status === "succeeded").reduce((n, r) => n + Number(r.amount), 0);
  const failedRefunds = (refunds ?? []).filter((r) => r.status === "failed");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Payments</h1>
        <p className="mt-1 text-slate-600">Online payments through SSLCommerz, refunds and platform revenue.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Collected" value={formatFee(collected)} />
        <Stat label="Platform commission" value={formatFee(commission)} />
        <Stat label="Refunded" value={formatFee(refundedTotal)} />
      </div>

      {failedRefunds.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-red-900">Refunds needing attention ({failedRefunds.length})</h2>
            <form action={catchUpRefunds}>
              <button type="submit" className="text-sm font-medium text-red-900 underline">Check for missed refunds</button>
            </form>
          </div>
          <ul className="mt-3 divide-y divide-red-200 text-sm">
            {failedRefunds.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{formatFee(r.amount)} · attempt {r.attempts}</p>
                  <p className="truncate text-red-800">{r.error ?? "Unknown error"}</p>
                </div>
                <RefundRetry refundId={r.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="Filter by status" className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 sm:self-start">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/payments?status=${t.value}`}
            aria-current={t.value === status ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
              t.value === status ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {payments?.length ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-2.5">Date</th>
                <th scope="col" className="px-4 py-2.5">Patient → Doctor</th>
                <th scope="col" className="px-4 py-2.5">Transaction</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
                <th scope="col" className="px-4 py-2.5 text-right">Amount</th>
                <th scope="col" className="px-4 py-2.5 text-right">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    <LocalTime iso={p.paid_at ?? p.created_at} format="dateTime" />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{nameBy.get(p.patient_id)}</span>
                    <span className="text-slate-400"> → </span>
                    <span className="text-slate-700">{nameBy.get(p.doctor_id)}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {p.tran_id}
                    {p.provider === "mock" && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-900">TEST</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_TONE[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatFee(p.amount)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{p.commission_amount != null ? formatFee(p.commission_amount) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">No payments here.</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
