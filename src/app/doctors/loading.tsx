/** Skeleton while search results load. */
export default function Loading() {
  return (
    <main className="flex-1 bg-slate-50" aria-busy="true" aria-label="Loading doctors">
      <div className="border-b border-slate-200 bg-white">
        <div className="page-container py-8">
          <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 h-12 max-w-2xl animate-pulse rounded-xl bg-slate-100" />
        </div>
      </div>
      <div className="page-container grid-auto-fill gap-4 py-8 [--card-min:17rem]">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
    </main>
  );
}
