import type { Metadata } from "next";
import Link from "next/link";
import { AppointmentStatusPill } from "@/components/appointments/status-pill";
import { LocalTime } from "@/components/ui/local-time";
import { listDoctorAppointments, type DoctorView } from "@/lib/appointments/queries";
import { paymentLabel } from "@/lib/appointments/constants";
import { requireRole } from "@/lib/auth/guards";
import { getOrCreateOwnProfile } from "@/lib/doctor/queries";
import { CONSULTATION_TYPE_LABEL } from "@/lib/schedule/constants";

export const metadata: Metadata = { title: "Appointments · MedLife" };

const TABS: { value: DoctorView; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

export default async function DoctorAppointmentsPage({ searchParams }: PageProps<"/doctor/appointments">) {
  const user = await requireRole("doctor", "/doctor/appointments");
  const profile = await getOrCreateOwnProfile(user);
  const { view: raw } = await searchParams;
  const view = TABS.find((t) => t.value === raw)?.value ?? "today";
  const items = await listDoctorAppointments(user.id, view, profile.timezone);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Appointments</h1>
        <p className="mt-1 text-slate-600">Your queue and bookings. Times shown in your time zone.</p>
      </div>

      <nav aria-label="Appointment views" className="flex gap-1 rounded-lg bg-slate-100 p-1 sm:self-start">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/doctor/appointments?view=${t.value}`}
            aria-current={t.value === view ? "page" : undefined}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${
              t.value === view ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          {view === "today" ? "No appointments today." : view === "upcoming" ? "No upcoming bookings." : "No past appointments."}
        </p>
      ) : (
        <ol className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {items.map((a, i) => (
            <li key={a.id}>
              <Link href={`/doctor/appointments/${a.id}`} className="flex flex-col gap-2 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                {view === "today" && (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700" aria-label={`Serial ${i + 1}`}>
                    {i + 1}
                  </span>
                )}
                <div className="w-44 shrink-0 text-sm font-semibold text-slate-900">
                  <LocalTime iso={a.slot_start} format={view === "today" ? "time" : "dateTime"} fallbackZone={profile.timezone} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{a.patient?.full_name || a.patient?.email || "Patient"}</p>
                  <p className="text-sm text-slate-600">
                    {CONSULTATION_TYPE_LABEL[a.consultation_type]}
                    {a.chamber && ` · ${a.chamber.name}`} · {paymentLabel(a.consultation_type, a.payment_status)}
                  </p>
                </div>
                <AppointmentStatusPill status={a.status} />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
