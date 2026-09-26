const STEPS = ["Health profile", "Medical reports"];

/** Progress banner for the optional first-time setup after sign-up. */
export function WelcomeSteps({ current }: { current: 1 | 2 }) {
  return (
    <div className="mb-6 rounded-2xl border border-teal-200 bg-teal-50 p-4 sm:p-5">
      <p className="text-sm font-semibold text-teal-900">Welcome to MedLife! Let&apos;s set up your account.</p>
      <ol className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const state = step < current ? "done" : step === current ? "current" : "todo";
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className="flex items-center gap-2"
            >
              <span
                className={`grid size-6 place-items-center rounded-full text-xs font-bold ${
                  state === "todo" ? "bg-white text-slate-500 ring-1 ring-slate-300" : "bg-teal-700 text-white"
                }`}
              >
                {state === "done" ? "✓" : step}
              </span>
              <span className={state === "todo" ? "text-slate-600" : "font-medium text-teal-900"}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
