import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelForm } from "@/components/appointments/cancel-form";
import { AppointmentHistory } from "@/components/appointments/history";
import { StatusActions } from "@/components/appointments/status-actions";
import { JoinCard } from "@/components/consult/join-card";
import { AdviceForm, StartPrescriptionButton } from "@/components/prescriptions/advice";
import { AdviceList, PrescriptionList } from "@/components/prescriptions/rx-lists";
import { AppointmentStatusPill } from "@/components/appointments/status-pill";
import { SlotPicker } from "@/components/schedule/slot-picker";
import { LocalTime } from "@/components/ui/local-time";
import { rescheduleAppointment } from "@/lib/appointments/actions";
import { isLive, paymentLabel } from "@/lib/appointments/constants";
import { getDoctorAppointment } from "@/lib/appointments/queries";
import { requireRole } from "@/lib/auth/guards";
import { formatFee } from "@/lib/doctor/constants";
import { getOrCreateOwnProfile, getPortfolioDetails } from "@/lib/doctor/queries";
import { ageFromDob, formatBytes, formatDate } from "@/lib/format";
import { FILE_CATEGORY_LABEL, SEX_OPTIONS } from "@/lib/patient/constants";
import { listAdvice, listForAppointment } from "@/lib/prescriptions/queries";
import { CONSULTATION_TYPE_LABEL } from "@/lib/schedule/constants";
import { getAvailableSlots } from "@/lib/schedule/queries";

export const metadata: Metadata = { title: "Appointment · MedLife" };

export default async function DoctorAppointmentPage({ params }: PageProps<"/doctor/appointments/[id]">) {
  const user = await requireRole("doctor", "/doctor/appointments");
  const { id } = await params;
  const appt = /^[0-9a-f-]{36}$/i.test(id) ? await getDoctorAppointment(id) : null;
  if (!appt || appt.doctor_id !== user.id) notFound();

  const profile = await getOrCreateOwnProfile(user);
  const live = isLive(appt.status);
  const [slots, details, prescriptions, advice] = await Promise.all([
    live ? getAvailableSlots(user.id, { days: 14, asViewer: true }) : Promise.resolve([]),
    getPortfolioDetails(user.id),
    listForAppointment(appt.id),
    listAdvice({ appointmentId: appt.id }),
  ]);
  const canTreat = appt.status !== "cancelled" && appt.status !== "expired";
  const hp = appt.profile;
  const age = ageFromDob(hp?.date_of_birth ?? null);
  const sex = SEX_OPTIONS.find((s) => s.value === hp?.sex)?.label;
  const tz = profile.timezone;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/doctor/appointments" className="text-sm font-medium text-teal-700 hover:underline">
        ← Appointments
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {appt.patient?.full_name || appt.patient?.email || "Patient"}
        </h1>
        <AppointmentStatusPill status={appt.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_18rem] @5xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <JoinCard appointment={appt} role="doctor" zone={tz} />
          <Card title="Appointment">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Row label="When"><LocalTime iso={appt.slot_start} fallbackZone={tz} /></Row>
              <Row label="Type">
                {CONSULTATION_TYPE_LABEL[appt.consultation_type]}
                {appt.chamber && ` · ${appt.chamber.name}`}
              </Row>
              <Row label="Fee">{formatFee(appt.fee)} · {paymentLabel(appt.payment_method, appt.payment_status, appt.status)}</Row>
              <Row label="Contact">{[appt.patient?.phone, appt.patient?.email].filter(Boolean).join(" · ") || "—"}</Row>
              {appt.patient_note && (
                <div className="rounded-lg bg-amber-50 p-3 sm:col-span-2">
                  <dt className="text-amber-800">Reason for visit</dt>
                  <dd className="mt-0.5 font-medium text-slate-900">{appt.patient_note}</dd>
                </div>
              )}
              {appt.status === "cancelled" && appt.cancel_reason && <Row label="Cancellation reason">{appt.cancel_reason}</Row>}
            </dl>
            {(appt.status === "confirmed" || appt.status === "in_progress") && (
              <div className="mt-5">
                <StatusActions appointmentId={appt.id} status={appt.status} online={appt.consultation_type === "online"} />
              </div>
            )}
          </Card>

          <Card title="Prescription & advice">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <PrescriptionList
                  rows={prescriptions}
                  hrefBase="/doctor/prescriptions"
                  zone={tz}
                  empty="No prescription for this visit yet."
                />
                {canTreat && (
                  <StartPrescriptionButton
                    appointmentId={appt.id}
                    label={prescriptions.some((p) => p.status === "draft") ? "Continue draft" : prescriptions.length ? "Write another prescription" : "Write prescription"}
                  />
                )}
                {appt.consultation_type === "online" && canTreat && (
                  <p className="text-xs text-slate-500">Online visit: your consultation notes are copied in, and controlled drugs are blocked.</p>
                )}
              </div>
              <div className="border-t border-slate-200 pt-5">
                <h3 className="mb-3 font-semibold text-slate-900">Advice without a prescription</h3>
                <AdviceList rows={advice} zone={tz} empty="No advice sent for this visit." />
                {canTreat && (
                  <div className="mt-4">
                    <AdviceForm patientId={appt.patient_id} appointmentId={appt.id} />
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card title="Health profile">
            {hp ? (
              <div className="flex flex-col gap-4">
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <Row label="Age">{age != null ? `${age} years` : "—"}</Row>
                  <Row label="Sex">{sex ?? "—"}</Row>
                  <Row label="Blood group">{hp.blood_group ?? "—"}</Row>
                  <Row label="Weight">{hp.weight_kg != null ? `${hp.weight_kg} kg` : "—"}</Row>
                  <Row label="Height">{hp.height_cm != null ? `${hp.height_cm} cm` : "—"}</Row>
                  <Row label="Emergency contact">
                    {[hp.emergency_contact_name, hp.emergency_contact_phone].filter(Boolean).join(" · ") || "—"}
                  </Row>
                </dl>
                <TagRow label="Allergies" items={hp.allergies} tone="bg-red-50 text-red-800" />
                <TagRow label="Chronic conditions" items={hp.chronic_conditions} tone="bg-slate-100 text-slate-800" />
              </div>
            ) : (
              <p className="text-sm text-slate-600">The patient hasn&apos;t filled in a health profile yet.</p>
            )}
          </Card>

          <Card title={`Medical reports (${appt.files.length})`}>
            {appt.files.length === 0 ? (
              <p className="text-sm text-slate-600">No reports uploaded.</p>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                {appt.files.map((f) => (
                  <li key={f.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{f.title}</p>
                      <p className="text-sm text-slate-600">
                        {FILE_CATEGORY_LABEL[f.category]}
                        {f.report_date && ` · ${formatDate(f.report_date)}`} · {formatBytes(f.size_bytes)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <a href={`/medical-files/${f.id}`} target="_blank" rel="noopener noreferrer" className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50">
                        Open
                      </a>
                      <a href={`/medical-files/${f.id}?download=1`} className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50">
                        Download
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {live && (
            <Card title="Reschedule">
              <SlotPicker
                slots={slots.filter((s) => s.consultation_type === appt.consultation_type)}
                chamberNames={Object.fromEntries(details.chambers.map((c) => [c.id, c.name]))}
                select={{ action: rescheduleAppointment, hidden: { appointmentId: appt.id }, verb: "Move to" }}
                emptyText="No other free slots in the next 14 days."
              />
            </Card>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6 @4xl:self-start">
          {live && (
            <Card title="Cancel">
              <CancelForm appointmentId={appt.id} reasonRequired />
            </Card>
          )}
          <Card title="History">
            <AppointmentHistory events={appt.events} fallbackZone={tz} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function TagRow({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      {items.length ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map((i) => (
            <li key={i} className={`rounded-md px-2 py-0.5 text-sm ${tone}`}>
              {i}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm font-medium text-slate-900">None recorded</p>
      )}
    </div>
  );
}
