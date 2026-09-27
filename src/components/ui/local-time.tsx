"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

export const PRESETS = {
  dateTime: { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" },
  date: { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  dayMonth: { weekday: "short", day: "numeric", month: "short" },
  time: { hour: "numeric", minute: "2-digit" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/**
 * Renders an instant in the viewer's own time zone (NFR-09). During server
 * rendering and hydration it uses `fallbackZone`, then switches to local.
 */
export function LocalTime({
  iso,
  format = "dateTime",
  fallbackZone = "Asia/Dhaka",
  className,
}: {
  iso: string;
  format?: keyof typeof PRESETS;
  fallbackZone?: string;
  className?: string;
}) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const text = new Intl.DateTimeFormat("en-GB", {
    ...PRESETS[format],
    ...(isClient ? {} : { timeZone: fallbackZone }),
    hour12: true,
  }).format(new Date(iso));
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
