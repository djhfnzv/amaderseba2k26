import Link from "next/link";
import { notFound } from "next/navigation";
import { ComplaintForm, ReplyForm } from "@/components/complaints/forms";
import { ComplaintStatusPill, ComplaintThread } from "@/components/complaints/thread";
import { Alert } from "@/components/ui/alert";
import { LocalTime } from "@/components/ui/local-time";
import { requireRole } from "@/lib/auth/guards";
import { CATEGORY_LABEL } from "@/lib/complaints/constants";
import { getComplaint, listComplaintAppointments, listMyComplaints } from "@/lib/complaints/queries";
import { CONSULTATION_TYPE_LABEL } from "@/lib/schedule/constants";

type Role = "patient" | "doctor";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function MyComplaintsPage({ role }: { role: Role }) {
  await requireRole(role, `/${role}/complaints`);
  const rows = await listMyComplaints();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex animate-fade-up flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Help & complaints</h1>
          <p className="mt-1 text-slate-600">
            Something went wrong with an appointment, payment or {role === "patient" ? "doctor" : "patient"}? Tell us and our team
            will get back to you here.
          </p>
        </div>
        <Link
          href={`/${role}/complaints/new`}
          className="inline-flex h-11 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
        >
          + New complaint
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="animate-fade-up rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          You haven&apos;t filed any complaints.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {rows.map((c, i) => (
            <li key={c.id} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }} className="animate-row-in">
              <Link
                href={`/${role}/complaints/${c.id}`}
                className="flex flex-col gap-1 p-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="w-28 shrink-0 font-mono text-xs text-slate-500">{c.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{c.subject}</span>
                  <span className="block text-sm text-slate-500">{CATEGORY_LABEL[c.category]}</span>
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

export async function NewComplaintPage({ role, appointment }: { role: Role; appointment?: string }) {
  const user = await requireRole(role, `/${role}/complaints/new`);
  const appts = await listComplaintAppointments(user.id, role);
  const options = appts.map((a) => ({
    id: a.id,
    label: `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dhaka" }).format(new Date(a.slot_start))} · ${a.other} · ${
      CONSULTATION_TYPE_LABEL[a.consultation_type as keyof typeof CONSULTATION_TYPE_LABEL] ?? a.consultation_type
    }`,
  }));
  const preselect = appointment && options.some((o) => o.id === appointment) ? appointment : undefined;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href={`/${role}/complaints`} className="text-sm font-medium text-teal-700 hover:underline">
        ← Help & complaints
      </Link>
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">New complaint</h1>
        <p className="mt-1 text-slate-600">
          Our team usually replies within one working day. For a medical emergency, call 999 or go to the nearest hospital.
        </p>
      </div>
      <section className="animate-fade-up rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <ComplaintForm role={role} appointments={options} appointmentId={preselect} />
      </section>
    </div>
  );
}

export async function MyComplaintDetail({ role, id, filed }: { role: Role; id: string; filed: boolean }) {
  const user = await requireRole(role, `/${role}/complaints`);
  const c = UUID.test(id) ? await getComplaint(id) : null;
  if (!c || c.complainant_id !== user.id) notFound();
  const closed = c.status === "resolved" || c.status === "rejected";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href={`/${role}/complaints`} className="text-sm font-medium text-teal-700 hover:underline">
        ← Help & complaints
      </Link>
      {filed && <Alert kind="success">Complaint {c.code} received. We&apos;ll reply here and notify you.</Alert>}

      <div className="flex animate-fade-up flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-2xl font-bold tracking-tight text-slate-900">{c.subject}</h1>
        <ComplaintStatusPill status={c.status} />
      </div>
      <p className="-mt-4 text-sm text-slate-500">
        <span className="font-mono">{c.code}</span> · {CATEGORY_LABEL[c.category]}
        {c.appointment && (
          <>
            {" · "}
            <Link href={`/${role}/appointments/${c.appointment.id}`} className="text-teal-700 hover:underline">
              Appointment on <LocalTime iso={c.appointment.slot_start} format="dayMonth" />
            </Link>
          </>
        )}
      </p>

      {closed && c.resolution && (
        <section
          className={`animate-scale-in rounded-2xl border p-4 text-sm ${
            c.status === "resolved" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-slate-50 text-slate-800"
          }`}
        >
          <p className="font-semibold">{c.status === "resolved" ? "Resolved" : "Closed"}</p>
          <p className="mt-1 whitespace-pre-line">{c.resolution}</p>
          {c.refund_amount != null && c.refund_amount > 0 && (
            <p className="mt-2 font-medium">Refunded ৳{Number(c.refund_amount).toLocaleString()}</p>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <ComplaintThread complaint={c} viewer="complainant" />
        <div className="mt-6">
          <ReplyForm complaintId={c.id} isAdmin={false} closed={closed} />
        </div>
      </section>
    </div>
  );
}
