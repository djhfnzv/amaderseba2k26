import type { Metadata } from "next";
import Link from "next/link";
import { InlineAction } from "@/components/ui/inline-action";
import { LocalTime } from "@/components/ui/local-time";
import { requireRole } from "@/lib/auth/guards";
import { retrySms, sendPendingSmsNow } from "@/lib/notifications/actions";
import { listSmsLog, smsCounts } from "@/lib/notifications/queries";
import { maskBdPhone } from "@/lib/sms/phone";
import { smsBalance, smsIsLive, smsProvider } from "@/lib/sms/provider";
import type { SmsStatus } from "@/types/database";

export const metadata: Metadata = { title: "SMS log · Admin · MedLife" };

const TABS: { value: SmsStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Queued" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_STYLE: Record<SmsStatus, string> = {
  pending: "bg-amber-50 text-amber-800",
  sending: "bg-sky-50 text-sky-800",
  sent: "bg-emerald-50 text-emerald-800",
  failed: "bg-red-50 text-red-800",
  cancelled: "bg-slate-100 text-slate-600",
};

export default async function AdminSmsPage({ searchParams }: PageProps<"/admin/sms">) {
  await requireRole("admin", "/admin/sms");
  const { status: raw } = await searchParams;
  const tab = TABS.find((t) => t.value === raw)?.value ?? "all";
  const [rows, counts, balance] = await Promise.all([
    listSmsLog({ status: tab === "all" ? undefined : tab }),
    smsCounts(),
    smsBalance(),
  ]);
  const live = smsIsLive();
  const cronReady = !!process.env.CRON_SECRET;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">SMS log</h1>
          <p className="mt-1 text-slate-600">Texts sent to patients and doctors through {smsProvider() === "bulksmsbd" ? "BulkSMSBD" : "the test logger"}.</p>
        </div>
        <form action={sendPendingSmsNow}>
          <button type="submit" className="h-10 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
            Send queued now
          </button>
        </form>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Gateway" value={live ? "BulkSMSBD (live)" : "Test mode"} tone={live ? "text-emerald-700" : "text-amber-700"} />
        <Stat label="Balance" value={balance ?? "—"} />
        <Stat label="Queued" value={String(counts.pending + counts.sending)} />
        <Stat label="Failed" value={String(counts.failed)} tone={counts.failed ? "text-red-700" : undefined} />
      </dl>

      {(!live || !cronReady) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {!live && (
            <p>
              Messages are only recorded. To send real SMS set <code>SMS_PROVIDER=bulksmsbd</code>, <code>BULKSMSBD_API_KEY</code> and{" "}
              <code>BULKSMSBD_SENDER_ID</code>.
            </p>
          )}
          {!cronReady && (
            <p className={live ? "" : "mt-1"}>
              <code>CRON_SECRET</code> isn&apos;t set, so reminders only go out when someone presses “Send queued now”. See the README (M11).
            </p>
          )}
        </div>
      )}

      <nav aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 sm:self-start">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/sms?status=${t.value}`}
            aria-current={t.value === tab ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${t.value === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            {t.label}
            {t.value !== "all" && <span className="ml-1 text-slate-400">{t.value === "pending" ? counts.pending + counts.sending : counts[t.value]}</span>}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">No messages.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
              <div className="w-40 shrink-0 text-sm">
                <p className="font-medium text-slate-900">{r.user_name ?? "—"}</p>
                <p className="text-slate-500">{maskBdPhone(r.phone)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words text-slate-800">{r.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  <LocalTime iso={r.sent_at ?? r.created_at} />
                  {r.attempts > 1 && ` · ${r.attempts} attempts`}
                  {r.provider && ` · ${r.provider}`}
                </p>
                {r.error && <p className="mt-1 text-xs text-red-700">{r.error}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                {r.status === "failed" && <InlineAction action={retrySms} fields={{ id: r.id }} label="Retry" pendingLabel="Sending…" />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold ${tone ?? "text-slate-900"}`}>{value}</dd>
    </div>
  );
}
