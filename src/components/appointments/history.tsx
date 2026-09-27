import { LocalTime } from "@/components/ui/local-time";
import { EVENT_LABEL } from "@/lib/appointments/constants";
import type { AppointmentEvent } from "@/types/database";

export function AppointmentHistory({ events, fallbackZone }: { events: AppointmentEvent[]; fallbackZone?: string }) {
  if (events.length === 0) return <p className="text-sm text-slate-600">No activity yet.</p>;
  return (
    <ol className="flex flex-col gap-3 text-sm">
      {events.map((e) => (
        <li key={e.id} className="border-l-2 border-slate-200 pl-3">
          <p className="font-medium text-slate-900">{EVENT_LABEL[e.action]}</p>
          <p className="text-slate-500">
            <LocalTime iso={e.created_at} fallbackZone={fallbackZone} />
          </p>
          {e.note && <p className="mt-1 text-slate-700">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}
