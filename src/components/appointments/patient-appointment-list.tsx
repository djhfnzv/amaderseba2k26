import Link from "next/link";
import { AppointmentStatusPill } from "./status-pill";
import { DoctorAvatar } from "@/components/doctor/doctor-avatar";
import { LocalTime } from "@/components/ui/local-time";
import type { WithDoctor } from "@/lib/appointments/queries";
import { doctorPhotoUrl } from "@/lib/doctor/constants";
import { CONSULTATION_TYPE_LABEL } from "@/lib/schedule/constants";

export function AppointmentList({ items, empty }: { items: WithDoctor[]; empty: string }) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
      {items.map((a) => (
        <li key={a.id}>
          <Link href={`/patient/appointments/${a.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50">
            <DoctorAvatar name={a.doctor?.display_name ?? "Doctor"} photoUrl={doctorPhotoUrl(a.doctor?.photo_path ?? null)} size={48} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold text-slate-900">{a.doctor?.display_name ?? "Doctor"}</p>
                <AppointmentStatusPill status={a.status} />
              </div>
              <p className="text-sm text-slate-600">
                <LocalTime iso={a.slot_start} fallbackZone={a.doctor?.timezone} /> · {CONSULTATION_TYPE_LABEL[a.consultation_type]}
                {a.chamber && ` · ${a.chamber.name}`}
              </p>
            </div>
            <span aria-hidden="true" className="text-slate-400">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
