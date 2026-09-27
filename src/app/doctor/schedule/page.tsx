import type { Metadata } from "next";
import Link from "next/link";
import { SlotPicker } from "@/components/schedule/slot-picker";
import { InlineAction } from "@/components/ui/inline-action";
import { requireRole } from "@/lib/auth/guards";
import { getOrCreateOwnProfile, getPortfolioDetails } from "@/lib/doctor/queries";
import { formatDate } from "@/lib/format";
import {
  CONSULTATION_TYPE_LABEL,
  WEEKDAYS,
  formatClock,
  slotsInBlock,
} from "@/lib/schedule/constants";
import {
  getAvailableSlots,
  listOwnAvailability,
  listUpcomingLeaves,
  todayIn,
} from "@/lib/schedule/queries";
import { deleteAvailability, deleteLeave, toggleAvailability } from "./actions";
import { AvailabilityForm } from "./availability-form";
import { LeaveForm } from "./leave-form";
import { TimezoneForm } from "./timezone-form";

export const metadata: Metadata = { title: "Schedule · MedLife" };

export default async function SchedulePage() {
  const user = await requireRole("doctor", "/doctor/schedule");
  const profile = await getOrCreateOwnProfile(user);
  const today = todayIn(profile.timezone);
  const [blocks, leaves, details, preview] = await Promise.all([
    listOwnAvailability(user.id),
    listUpcomingLeaves(user.id, today),
    getPortfolioDetails(user.id),
    getAvailableSlots(user.id, { days: 7, asViewer: true }),
  ]);

  const chamberName = Object.fromEntries(details.chambers.map((c) => [c.id, c.name]));
  const weeklySlots = blocks
    .filter((b) => b.is_active)
    .reduce((n, b) => n + slotsInBlock(b.start_time, b.end_time, b.consultation_minutes), 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Schedule</h1>
        <p className="mt-1 text-slate-600">
          Set your weekly hours. Patients can book a new slot every 30 minutes, from 2 hours ahead up
          to 30 days ahead.
        </p>
      </div>

      {!profile.offers_online && !profile.offers_in_person && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Turn on online and/or in-person consultations (with fees) in your{" "}
          <Link href="/doctor/portfolio" className="font-semibold underline">portfolio</Link> first.
        </div>
      )}

      <Card title="Time zone" description="Your weekly hours and leave dates are in this time zone.">
        <TimezoneForm current={profile.timezone} />
      </Card>

      <Card
        title="Weekly hours"
        description={`${blocks.length ? `${weeklySlots} bookable slots per week.` : "No hours yet."} Use several blocks in a day for breaks, e.g. 9–1 and 2–5.`}
      >
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
          {WEEKDAYS.map((d) => {
            const list = blocks.filter((b) => b.weekday === d.value);
            return (
              <li key={d.value} className="flex flex-col gap-2 p-4 sm:flex-row sm:gap-6">
                <p className="w-28 shrink-0 font-medium text-slate-900">{d.label}</p>
                {list.length === 0 ? (
                  <p className="text-sm text-slate-400">Off</p>
                ) : (
                  <ul className="flex flex-1 flex-col gap-2">
                    {list.map((b) => (
                      <li
                        key={b.id}
                        className={`flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
                          b.is_active ? "border-slate-200" : "border-dashed border-slate-300 opacity-60"
                        }`}
                      >
                        <div className="text-sm">
                          <p className="font-semibold text-slate-900">
                            {formatClock(b.start_time)} – {formatClock(b.end_time)}
                            {!b.is_active && <span className="ml-2 text-xs font-normal text-slate-500">(paused)</span>}
                          </p>
                          <p className="text-slate-600">
                            {CONSULTATION_TYPE_LABEL[b.consultation_type]}
                            {b.chamber_id && ` · ${chamberName[b.chamber_id] ?? "Chamber"}`} ·{" "}
                            {b.consultation_minutes} min · {slotsInBlock(b.start_time, b.end_time, b.consultation_minutes)} slots
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <InlineAction
                            action={toggleAvailability}
                            fields={{ id: b.id, active: String(!b.is_active) }}
                            label={b.is_active ? "Pause" : "Resume"}
                            pendingLabel="Saving…"
                          />
                          <InlineAction
                            action={deleteAvailability}
                            fields={{ id: b.id }}
                            label="Delete"
                            pendingLabel="Deleting…"
                            tone="danger"
                            confirmText="Delete these hours?"
                            ariaLabel={`Delete ${d.label} ${formatClock(b.start_time)} block`}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-6 rounded-xl border border-teal-200 bg-teal-50/40 p-4 sm:p-5">
          <h3 className="mb-4 font-semibold text-slate-900">Add hours</h3>
          <AvailabilityForm
            chambers={details.chambers.map((c) => ({ id: c.id, name: c.name }))}
            offersOnline={profile.offers_online}
            offersInPerson={profile.offers_in_person}
          />
        </div>
      </Card>

      <Card title="Leave & blocked dates" description="No slots are offered on these dates.">
        {leaves.length > 0 && (
          <ul className="mb-5 divide-y divide-slate-200 rounded-xl border border-slate-200">
            {leaves.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">
                    {formatDate(l.start_date)}
                    {l.end_date !== l.start_date && ` – ${formatDate(l.end_date)}`}
                    {l.start_time && l.end_time && ` · ${formatClock(l.start_time)} – ${formatClock(l.end_time)}`}
                  </p>
                  {l.reason && <p className="text-slate-600">{l.reason}</p>}
                </div>
                <InlineAction
                  action={deleteLeave}
                  fields={{ id: l.id }}
                  label="Remove"
                  pendingLabel="Removing…"
                  tone="danger"
                  confirmText="Remove this leave?"
                />
              </li>
            ))}
          </ul>
        )}
        <LeaveForm today={today} />
      </Card>

      <Card
        title="Preview: next 7 days"
        description={profile.is_verified ? "Exactly what patients see on your page." : "Patients will see this once you're verified."}
      >
        <SlotPicker
          slots={preview}
          chamberNames={chamberName}
          emptyText="No bookable slots in the next 7 days. Add weekly hours above."
        />
      </Card>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
