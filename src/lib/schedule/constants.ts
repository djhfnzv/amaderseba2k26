import type { ConsultationType } from "@/types/database";

/** Platform slot rules — keep in sync with get_available_slots() in the M6 migration. */
export const SLOT_INTERVAL_MINUTES = 30;
export const MIN_CONSULTATION_MINUTES = 15;
export const MAX_CONSULTATION_MINUTES = 25;
export const DEFAULT_CONSULTATION_MINUTES = 20;
export const MIN_NOTICE_HOURS = 2;
export const BOOKING_WINDOW_DAYS = 30;

export const DEFAULT_TIMEZONE = "Asia/Dhaka";

/** 0 = Sunday, matching Postgres extract(dow). Week shown starting Saturday (BD work week). */
export const WEEKDAYS = [
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
] as const;

export const WEEKDAY_LABEL: Record<number, string> = Object.fromEntries(
  WEEKDAYS.map((d) => [d.value, d.label]),
);

export const CONSULTATION_TYPE_LABEL: Record<ConsultationType, string> = {
  online: "Online (video)",
  in_person: "In-person",
};

/** "17:00:00" -> minutes since midnight. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "17:00:00" -> "5:00 PM" (wall-clock time, no zone conversion). */
export function formatClock(time: string): string {
  const mins = toMinutes(time);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Number of slots a block produces: one every 30 min while a full consultation fits. */
export function slotsInBlock(start: string, end: string, consultationMinutes: number): number {
  const span = toMinutes(end) - toMinutes(start) - consultationMinutes;
  return span < 0 ? 0 : Math.floor(span / SLOT_INTERVAL_MINUTES) + 1;
}

/** Fixed list (same on server and browser). The DB validates any IANA name. */
export const COMMON_TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Karachi",
  "Asia/Colombo",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Asia/Kuwait",
  "Asia/Bangkok",
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Rome",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Toronto",
  "UTC",
];
