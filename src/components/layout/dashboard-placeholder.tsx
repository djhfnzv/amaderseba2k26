/** Temporary dashboard body until the role's own modules are built. */
export function DashboardPlaceholder({
  title,
  description,
  upcoming,
}: {
  title: string;
  description: string;
  upcoming: string[];
}) {
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
      <p className="mt-1 text-slate-600">{description}</p>
      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-6">
        <p className="text-sm font-semibold text-slate-900">Coming soon</p>
        <ul className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {upcoming.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-teal-600" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
