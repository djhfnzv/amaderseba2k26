const STAR = "M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9L12 2.8Z";

const SIZES = { sm: "size-3.5", md: "size-4", lg: "size-6" } as const;

/** Read-only stars; supports fractions (e.g. 4.3 fills 4 and a third). */
export function StarRating({ value, size = "md", className = "" }: { value: number; size?: keyof typeof SIZES; className?: string }) {
  const pct = Math.max(0, Math.min(5, value)) * 20;
  return (
    <span role="img" aria-label={`${value.toFixed(1)} out of 5 stars`} className={`relative inline-flex shrink-0 ${className}`}>
      <span className="flex text-slate-200" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <svg key={i} viewBox="0 0 24 24" className={SIZES[size]} fill="currentColor">
            <path d={STAR} />
          </svg>
        ))}
      </span>
      <span className="absolute inset-0 flex overflow-hidden text-amber-400" style={{ width: `${pct}%` }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <svg key={i} viewBox="0 0 24 24" className={`${SIZES[size]} shrink-0`} fill="currentColor">
            <path d={STAR} />
          </svg>
        ))}
      </span>
    </span>
  );
}

export { STAR as STAR_PATH };
