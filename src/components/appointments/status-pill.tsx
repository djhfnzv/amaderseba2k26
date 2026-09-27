import { APPOINTMENT_STATUS } from "@/lib/appointments/constants";
import type { AppointmentStatus } from "@/types/database";

export function AppointmentStatusPill({ status }: { status: AppointmentStatus }) {
  const meta = APPOINTMENT_STATUS[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.tone}`}>
      {meta.label}
    </span>
  );
}
