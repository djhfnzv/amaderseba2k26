import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatFee } from "@/lib/doctor/constants";
import { isMockEnabled } from "@/lib/payments/config";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Test payment gateway", robots: { index: false } };

/** Stand-in for the SSLCommerz checkout page. Development only (PAYMENT_PROVIDER=mock). */
export default async function MockGatewayPage({ searchParams }: PageProps<"/pay/mock">) {
  const { tran_id } = await searchParams; // read first so the page is always rendered per request
  if (!isMockEnabled()) notFound();
  const tranId = typeof tran_id === "string" ? tran_id : "";

  const { data: payment } = await createAdminClient()
    .from("payments")
    .select("tran_id, amount, status, provider")
    .eq("tran_id", tranId)
    .maybeSingle();
  if (!payment || payment.provider !== "mock") notFound();

  const post = (event: string, extra: Record<string, string> = {}) => (
    <form action={`/api/payments/mock/${event}`} method="post">
      <input type="hidden" name="tran_id" value={payment.tran_id} />
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        className={`h-11 w-full rounded-lg text-sm font-semibold ${
          event === "success"
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {event === "success" ? `Pay ${formatFee(payment.amount)}` : event === "fail" ? "Simulate failure" : "Cancel payment"}
      </button>
    </form>
  );

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-amber-300 bg-white p-6 shadow-sm">
        <p className="rounded-md bg-amber-100 px-2 py-1 text-center text-xs font-semibold uppercase tracking-wide text-amber-900">
          Test gateway — no real money
        </p>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Pay {formatFee(payment.amount)}</h1>
        <p className="mt-1 text-sm text-slate-600">Transaction {payment.tran_id}</p>
        {payment.status !== "initiated" ? (
          <p className="mt-4 text-sm text-slate-700">This transaction is already {payment.status}.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            {post("success", { val_id: `MOCK-${payment.tran_id}`, status: "VALID" })}
            {post("fail", { status: "FAILED" })}
            {post("cancel", { status: "CANCELLED" })}
          </div>
        )}
      </div>
    </main>
  );
}
