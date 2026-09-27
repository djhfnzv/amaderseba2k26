/** Name / specialty search box. GET form so it works everywhere (landing, results page). */
export function SearchBar({
  defaultValue = "",
  keep,
  size = "md",
}: {
  defaultValue?: string;
  /** Other filters to carry along with a new text search. */
  keep?: Record<string, string>;
  size?: "md" | "lg";
}) {
  const h = size === "lg" ? "h-14 text-base" : "h-12 text-base";
  return (
    <form action="/doctors" method="get" role="search" className="flex w-full gap-2">
      {keep &&
        Object.entries(keep)
          .filter(([, v]) => v)
          .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor={`search-${size}`} className="sr-only">
        Search doctors by name or specialty
      </label>
      <div className="relative flex-1">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </svg>
        <input
          id={`search-${size}`}
          name="q"
          type="search"
          defaultValue={defaultValue}
          maxLength={100}
          placeholder="Doctor name or specialty, e.g. Cardiology"
          className={`${h} w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-teal-600`}
        />
      </div>
      <button
        type="submit"
        className={`${h} shrink-0 rounded-xl bg-teal-700 px-5 font-semibold text-white hover:bg-teal-800`}
      >
        Search
      </button>
    </form>
  );
}
