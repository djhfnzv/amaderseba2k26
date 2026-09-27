"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
}
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Countdown until the room opens; reloads the page when it does. */
export function OpensSoon({ opensAt }: { opensAt: string }) {
  const router = useRouter();
  const now = useSyncExternalStore(subscribe, nowSeconds, () => null);
  const opens = new Date(opensAt).getTime();

  useEffect(() => {
    const ms = opens - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => router.refresh(), Math.min(ms + 500, 2_147_000_000));
    return () => clearTimeout(t);
  }, [opens, router]);

  if (now === null) return null;
  const left = Math.max(0, opens - now * 1000);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <p className="mt-4 font-mono text-3xl font-bold tabular-nums text-slate-900" aria-live="off">
      {h > 0 && `${h}:`}
      {String(m).padStart(h > 0 ? 2 : 1, "0")}:{String(s).padStart(2, "0")}
    </p>
  );
}
