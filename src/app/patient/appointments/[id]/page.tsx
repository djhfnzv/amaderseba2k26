import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelForm } from "@/components/appointments/cancel-form";
import { AppointmentHistory } from "@/components/appointments/history";
import { AppointmentStatusPill } from "@/components/appointments/status-pill";
import { DoctorAvatar } from "@/components/doctor/doctor-avatar";
import { SlotPicker } from "@/components/schedule/slot-picker";
import { Alert } from "@/components/ui/alert";
import { LocalTime } from "@/components/ui/local-time";
import { rescheduleAppointment } from "@/lib/appointments/actions";
import { PATIENT_CHANGE_CUTOFF_HOURS, patientCanChange, paymentLabel } from "@/lib/appointments/constants";
import { getAppointmentWithDoctor, listEvents } from "@/lib/appointments/queries";
import { requireRole } from "@/lib/auth/guards";
import { doctorPhotoUrl, formatFee } from "@/lib/doctor/constants";
import { CONSULTATION_TYPE_LABEL } from "@/lib/schedule/constants";
import { getAvailableSlots } from "@/lib/schedule/queries";

export const metadata: Metadata = { title: "Appointment · MedLife" };

export default async function PatientAppointmentPage({ params, searchParams }: PageProps<"/patient/appointments/[id]">) {
  const user = await requireRole("patient", "/patient/appointments");
  const [{ id }, { booked }] = await Promise.all([params, searchParams]);
  const appt = /^[0-9a-f-]{36}$/i.test(id) ? await getAppointmentWithDoctor(id) : null;
  if (!appt || appt.patient_id !== user.id) notFound();

  const canChange = patientCanChange(appt.status, appt.slot_start);
  const [events, slots] = await Promise.all([
    listEvents(appt.id),
    canChange ? getAvailableSlots(appt.doctor_id, { days: 14, asViewer: true }) : Promise.resolve([]),
  ]);
  const sameTypeSlots = slots.filter((s) => s.consultation_type === appt.consultation_type);
  const zone = appt.doctor?.timezone;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/patient/appointments" className="text-sm font-medium text-teal-700 hover:underline">
        ← My appointments
      </Link>

      {booked === "1" && appt.status === "confirmed" && (
        <Alert kind="success">
          Your appointment is confirmed. We&apos;ve saved it under My appointments.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_18rem] @5xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-4">
              <DoctorAvatar name={appt.doctor?.display_name ?? "Doctor"} photoUrl={doctorPhotoUrl(appt.doctor?.photo_path ?? null)} size={56} />
              <div className="min-w-0 flex-1">
                {appt.doctor ? (
                  <Link href={`/patient/doctors/${appt.doctor.slug}`} className="font-semibold text-slate-900 hover:text-teal-700">
                    {appt.doctor.display_name}
                  </Link>
                ) : (
                  <p className="font-semibold text-slate-900">Doctor</p>
                )}
                {appt.doctor?.headline && <p className="text-sm text-slate-600">{appt.doctor.headline}</p>}
              </div>
              <AppointmentStatusPill status={appt.status} />
            </div>

            <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
              <Row label="When"><LocalTime iso={appt.slot_start} fallbackZone={zone} /></Row>
              <Row label="Type">{CONSULTATION_TYPE_LABEL[appt.consultation_type]}</Row>
              <Row label="Where">
                {appt.consultation_type === "online"
                  ? "Video call — the join button appears here 10 minutes before the start (coming with M9)"
                  : appt.chamber
                    ? `${appt.chamber.name}, ${appt.chamber.address}, ${appt.chamber.city}`
                    : "Chamber"}
              </Row>
              <Row label="Fee">
                {formatFee(appt.fee)} · {paymentLabel(appt.consultation_type, appt.payment_status)}
              </Row>
              {appt.chamber?.phone && <Row label="Chamber phone">{appt.chamber.phone}</Row>}
              {appt.patient_note && <Row label="Your note">{appt.patient_note}</Row>}
              {appt.status === "cancelled" && appt.cancel_reason && <Row label="Cancellation reason">{appt.cancel_reason}</Row>}
            </dl>
          </section>

          {canChange && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">Reschedule</h2>
              <p className="mt-1 text-sm text-slate-600">Pick a new time with the same doctor.</p>
              <div className="mt-4">
                <SlotPicker
                  slots={sameTypeSlots}
                  chamberNames={appt.chamber ? { [appt.chamber.id]: appt.chamber.name } : {}}
                  select={{ action: rescheduleAppointment, hidden: { appointmentId: appt.id }, verb: "Move to" }}
                  emptyText="No other free slots in the next 14 days."
                />
              </div>
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6 @4xl:self-start">
          {canChange ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">Cancel</h2>
              <p className="mt-1 mb-4 text-sm text-slate-600">
                You can cancel or reschedule up to {PATIENT_CHANGE_CUTOFF_HOURS} hours before the start.
              </p>
              <CancelForm appointmentId={appt.id} reasonRequired={false} />
            </section>
          ) : (
            appt.status === "confirmed" && (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                It&apos;s less than {PATIENT_CHANGE_CUTOFF_HOURS} hours to the appointment, so it can no longer be changed
                online. Please call the chamber if needed.
              </p>
            )
          )}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">History</h2>
            <AppointmentHistory events={events} fallbackZone={zone} />
          </section>
        </aside>
      </div>
    </div>
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
