import Link from "next/link";
import { LocalTime } from "@/components/ui/local-time";
import { consultWindow } from "@/lib/appointments/constants";
import type { AppointmentStatus } from "@/types/database";

/** "Join video consultation" call-to-action for online appointments. */
export function JoinCard({
  appointment,
  role,
  zone,
}: {
  appointment: { id: string; consultation_type: string; status: AppointmentStatus; slot_start: string; slot_end: string };
  role: "doctor" | "patient";
  zone?: string;
}) {
  const state = consultWindow(appointment);
  if (state === "none") return null;
  const opensAt = new Date(new Date(appointment.slot_start).getTime() - 10 * 60_000).toISOString();

  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${
        state === "open" ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white"
      }`}
    >
      <div>
        <h2 className="font-semibold text-slate-900">Video consultation</h2>
        <p className="text-sm text-slate-600">
          {state === "open" && (role === "doctor" ? "The room is open. Start when you're ready." : "The room is open. Join now.")}
          {state === "upcoming" && (
            <>
              The room opens at <LocalTime iso={opensAt} format="time" fallbackZone={zone} /> (10 minutes before).
            </>
          )}
          {state === "closed" && "The room is closed."}
        </p>
      </div>
      {state !== "closed" && (
        <Link
          href={`/consult/${appointment.id}`}
          className={`inline-flex h-11 shrink-0 items-center justify-center rounded-lg px-5 text-sm font-semibold ${
            state === "open" ? "bg-teal-700 text-white hover:bg-teal-800" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {state === "open" ? (role === "doctor" ? "Start consultation" : "Join consultation") : "Open waiting room"}
        </Link>
      )}
    </section>
  );
}
