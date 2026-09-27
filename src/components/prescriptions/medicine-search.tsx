"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { addCustomMedicine } from "@/lib/prescriptions/actions";
import { FORM_OPTIONS, medicineLabel } from "@/lib/prescriptions/constants";
import type { Medicine, MedicineForm } from "@/types/database";

export type MedicinePick = Pick<Medicine, "id" | "generic_name" | "brand_name" | "strength" | "form" | "is_controlled">;

/** Type-ahead over the medicine catalogue, with "add a medicine that isn't listed". */
export function MedicineSearch({ onPick, disabled }: { onPick: (m: MedicinePick) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MedicinePick[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [custom, setCustom] = useState<null | { generic_name: string; strength: string; form: MedicineForm; brand_name: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/medicines?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const json = (await res.json()) as { medicines?: MedicinePick[] };
        setResults(json.medicines ?? []);
        setActive(0);
      } catch {
        /* aborted or offline */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Close the list when clicking elsewhere.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(m: MedicinePick) {
    onPick(m);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  function saveCustom() {
    if (!custom) return;
    setError(null);
    startTransition(async () => {
      const res = await addCustomMedicine(custom);
      if (!res.ok) return setError(res.error);
      pick(res.data);
      setCustom(null);
    });
  }

  const showList = open && q.trim().length >= 2;
  const options = showList ? results : [];

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">Search medicines</label>
      <div className="relative">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
          value={q}
          disabled={disabled}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            if (e.target.value.trim().length < 2) setResults([]);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (options[active]) pick(options[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Add a medicine — type a generic or brand name…"
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-slate-300 bg-white pr-9 pl-9 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
        />
        {loading && (
          <span className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700" aria-hidden="true" />
        )}
      </div>

      {showList && (
        <div className="absolute z-20 mt-1 w-full animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {options.map((m, i) => (
              <li
                key={m.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${i === active ? "bg-teal-50" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{medicineLabel(m)}</span>
                  {m.brand_name && <span className="block truncate text-xs text-slate-500">{m.generic_name}</span>}
                </span>
                {m.is_controlled && (
                  <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">Controlled</span>
                )}
              </li>
            ))}
            {!loading && options.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No match in the list.</li>}
          </ul>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setCustom({ generic_name: q.trim(), strength: "", form: "tablet", brand_name: "" });
              setOpen(false);
            }}
            className="w-full border-t border-slate-200 px-3 py-2 text-left text-sm font-medium text-teal-700 hover:bg-teal-50"
          >
            + Add “{q.trim()}” as a new medicine
          </button>
        </div>
      )}

      {custom && (
        <div className="mt-3 animate-fade-in rounded-xl border border-teal-200 bg-teal-50/50 p-3">
          <p className="text-sm font-semibold text-slate-900">New medicine</p>
          <p className="text-xs text-slate-600">Saved to your own list so you can pick it again next time.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1.3fr]">
            <MiniInput label="Generic name" value={custom.generic_name} onChange={(v) => setCustom({ ...custom, generic_name: v })} />
            <MiniInput label="Strength" value={custom.strength} placeholder="500 mg" onChange={(v) => setCustom({ ...custom, strength: v })} />
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
              Form
              <select
                value={custom.form}
                onChange={(e) => setCustom({ ...custom, form: e.target.value as MedicineForm })}
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
              >
                {FORM_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </label>
            <MiniInput label="Brand (optional)" value={custom.brand_name} onChange={(v) => setCustom({ ...custom, brand_name: v })} />
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={saveCustom}
              disabled={pending}
              className="h-9 rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {pending ? "Adding…" : "Add medicine"}
            </button>
            <button type="button" onClick={() => setCustom(null)} className="h-9 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
      {label}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
      />
    </label>
  );
}
