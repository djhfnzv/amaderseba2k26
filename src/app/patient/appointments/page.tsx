import type { Metadata } from "next";
import Link from "next/link";
import { AppointmentList } from "@/components/appointments/patient-appointment-list";
import { listPatientAppointments } from "@/lib/appointments/queries";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "My appointments · MedLife" };

export default async function PatientAppointmentsPage() {
  const user = await requireRole("patient", "/patient/appointments");
  const { upcoming, past } = await listPatientAppointments(user.id);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">My appointments</h1>
          <p className="mt-1 text-slate-600">Upcoming visits, history and changes.</p>
        </div>
        <Link href="/doctors" className="inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
          Book a doctor
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Upcoming ({upcoming.length})</h2>
        <AppointmentList items={upcoming} empty="No upcoming appointments." />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Past & cancelled</h2>
        <AppointmentList items={past} empty="Nothing here yet." />
      </section>
    </div>
  );
}
