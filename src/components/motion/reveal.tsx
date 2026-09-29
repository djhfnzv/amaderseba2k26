"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fades a section up as it scrolls into view (once). Without JavaScript, or
 * with reduced motion, the content is simply shown.
 */
export function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal={shown ? "shown" : "hidden"} className={className}>
      {children}
    </div>
  );
}
