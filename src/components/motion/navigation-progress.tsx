"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Thin progress bar at the top while a page is loading after a link click.
 * It creeps towards 85% and completes (then fades) when the new page arrives.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const current = `${pathname}?${search.toString()}`;
  // The page we started from; the bar finishes once the URL moves on.
  const [started, setStarted] = useState<{ id: number; from: string } | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setStarted({ id: Date.now(), from: `${location.pathname}?${new URLSearchParams(location.search).toString()}` });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!started) return null;
  const loading = started.from === current;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-0.5" aria-hidden="true">
      <div key={`${started.id}-${loading}`} className={`h-full bg-teal-500 shadow-[0_0_8px] shadow-teal-400/70 ${loading ? "nav-progress-run" : "nav-progress-done"}`} />
    </div>
  );
}
