/** Time zone helpers that work the same on server and client. */

/** ISO instant for local midnight in `timeZone`, `offsetDays` from today. */
export function zonedStartOfDay(timeZone: string, offsetDays: number): string {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d + offsetDays);
  // Offset of the zone at that instant (e.g. +06:00 for Dhaka), applied to UTC midnight.
  const offsetMin = tzOffsetMinutes(timeZone, new Date(guess));
  return new Date(guess - offsetMin * 60_000).toISOString();
}

function tzOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}
