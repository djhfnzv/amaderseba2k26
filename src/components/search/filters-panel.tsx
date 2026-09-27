"use client";

import { useState } from "react";

/** On small screens the filters collapse behind a button; always visible on desktop. */
export function FiltersPanel({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="search-filters"
        className="flex h-11 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 lg:hidden"
      >
        <span>
          Filters{activeCount > 0 && <span className="ml-1 text-teal-700">({activeCount})</span>}
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div id="search-filters" className={`${open ? "mt-3 block" : "hidden"} lg:mt-0 lg:block`}>
        {children}
      </div>
    </div>
  );
}
