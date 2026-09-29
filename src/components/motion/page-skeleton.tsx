/** Placeholder shown while a dashboard page loads (shimmer, no layout jump). */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-8 w-56 rounded-lg" />
        <div className="skeleton h-4 w-80 max-w-full rounded" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 @3xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="skeleton size-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="skeleton h-4 w-1/2 rounded" />
              <div className="skeleton h-3 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
