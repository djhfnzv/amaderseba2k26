import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RefundForm, ReplyForm, StatusForm } from "@/components/complaints/forms";
import { ComplaintStatusPill, ComplaintThread } from "@/components/complaints/thread";
import { LocalTime } from "@/components/ui/local-time";
import { requireRole } from "@/lib/auth/guards";
import { CATEGORY_LABEL, PRIORITY_TONE } from "@/lib/complaints/constants";
import { getComplaint } from "@/lib/complaints/queries";

export const metadata: Metadata = { title: "Complaint · Admin · MedLife" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminComplaintPage({ params }: PageProps<"/admin/complaints/[id]">) {
  await requireRole("admin", "/admin/complaints");
  const { id } = await params;
  const c = UUID.test(id) ? await getComplaint(id) : null;
  if (!c) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/complaints" className="text-sm font-medium text-teal-700 hover:underline">
        ← Complaints
      </Link>

      <div className="animate-fade-up">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-2xl font-bold tracking-tight text-slate-900">{c.subject}</h1>
          <ComplaintStatusPill status={c.status} />
          {c.priority !== "normal" && <span className={`text-sm font-semibold capitalize ${PRIORITY_TONE[c.priority]}`}>{c.priority}</span>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          <span className="font-mono">{c.code}</span> · {CATEGORY_LABEL[c.category]} · filed <LocalTime iso={c.created_at} />
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <ComplaintThread complaint={c} viewer="admin" />
          <div className="mt-6">
            <ReplyForm complaintId={c.id} isAdmin closed={false} />
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-4 @4xl:self-start">
          <Card title="Status">
            <StatusForm complaintId={c.id} status={c.status} priority={c.priority} resolution={c.resolution} />
          </Card>

          <Card title="People">
            <dl className="flex flex-col gap-3 text-sm">
              <Person label={`Filed by (${c.complainant_role})`} person={c.complainant} />
              {c.against && <Person label={`About (${c.against.role})`} person={c.against} />}
            </dl>
          </Card>

          {c.appointment && (
            <Card title="Appointment">
              <dl className="grid gap-2 text-sm">
                <Row label="When"><LocalTime iso={c.appointment.slot_start} /></Row>
                <Row label="Doctor">{c.appointment.doctor_name ?? "—"}</Row>
                <Row label="Patient">{c.appointment.patient_name ?? "—"}</Row>
                <Row label="Type / status">
                  <span className="capitalize">
                    {c.appointment.consultation_type.replace("_", "-")} · {c.appointment.status.replace("_", " ")}
                  </span>
                </Row>
                <Row label="Payment">
                  <span className="capitalize">{c.appointment.payment_status.replace("_", " ")}</span>
                  {c.appointment.fee != null && ` · ৳${Number(c.appointment.fee).toLocaleString()}`}
                </Row>
              </dl>
            </Card>
          )}

          {c.payment && (
            <Card title="Refund">
              {c.refund_amount != null && c.refund_amount > 0 && (
                <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  ৳{Number(c.refund_amount).toLocaleString()} refunded through this complaint.
                </p>
              )}
              {c.payment.refundable > 0 ? (
                <RefundForm complaintId={c.id} refundable={c.payment.refundable} paid={c.payment.amount} />
              ) : (
                <p className="text-sm text-slate-600">Nothing left to refund on this payment.</p>
              )}
            </Card>
          )}

          <Link href={`/admin/audit?q=${c.id}`} className="text-center text-sm font-medium text-teal-700 hover:underline">
            Audit trail for this complaint
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade-up rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function Person({
  label,
  person,
}: {
  label: string;
  person: { id: string; full_name: string; email: string | null; phone?: string | null } | null;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      {person ? (
        <dd>
          <Link href={`/admin/users/${person.id}`} className="font-medium text-slate-900 hover:text-teal-700">
            {person.full_name || person.email}
          </Link>
          <span className="block text-xs text-slate-500">{[person.email, person.phone].filter(Boolean).join(" · ")}</span>
        </dd>
      ) : (
        <dd className="text-slate-500">Deleted account</dd>
      )}
    </div>
  );
}
