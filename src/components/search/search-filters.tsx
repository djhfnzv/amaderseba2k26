import Link from "next/link";
import type { Facets } from "@/lib/search/queries";
import { AVAILABILITY_OPTIONS, SORT_OPTIONS, TYPE_OPTIONS, type SearchFilters } from "@/lib/search/params";
import { FiltersPanel } from "./filters-panel";

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600";

/** Plain GET form: works without JavaScript and keeps every search shareable by URL. */
export function SearchFiltersForm({ filters, facets }: { filters: SearchFilters; facets: Facets }) {
  const active = [
    filters.specialty,
    filters.type,
    filters.minFee != null || filters.maxFee != null,
    filters.language,
    filters.city,
    filters.available,
  ].filter(Boolean).length;

  return (
    <FiltersPanel activeCount={active}>
      <form action="/doctors" method="get" className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        {/* Keep the text query when filters change. */}
        {filters.q && <input type="hidden" name="q" value={filters.q} />}

        <Select label="Specialty" name="specialty" value={filters.specialty} placeholder="All specialties">
          {facets.specialties.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name} ({s.count})
            </option>
          ))}
        </Select>

        <Select label="Consultation type" name="type" value={filters.type} placeholder="Any">
          {TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>

        <Select label="Available" name="available" value={filters.available ? String(filters.available) : ""} placeholder="Any time">
          {AVAILABILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-800">Fee (৳)</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="sr-only" htmlFor="minFee">Minimum fee</label>
            <input id="minFee" name="minFee" type="number" inputMode="numeric" min={0} placeholder="Min" defaultValue={filters.minFee ?? ""} className={inputClass} />
            <label className="sr-only" htmlFor="maxFee">Maximum fee</label>
            <input id="maxFee" name="maxFee" type="number" inputMode="numeric" min={0} placeholder="Max" defaultValue={filters.maxFee ?? ""} className={inputClass} />
          </div>
        </fieldset>

        {facets.languages.length > 0 && (
          <Select label="Language" name="language" value={filters.language} placeholder="Any language">
            {facets.languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        )}

        {facets.cities.length > 0 && (
          <Select label="City (chamber)" name="city" value={filters.city} placeholder="Any city">
            {facets.cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}

        <Select label="Sort by" name="sort" value={filters.sort} placeholder={null}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <button
          type="submit"
          className="h-10 rounded-lg bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Apply filters
        </button>
        {active > 0 && (
          <Link
            href={filters.q ? `/doctors?q=${encodeURIComponent(filters.q)}` : "/doctors"}
            className="text-center text-sm font-medium text-teal-700 hover:underline"
          >
            Clear filters
          </Link>
        )}
      </form>
    </FiltersPanel>
  );
}

function Select({
  label,
  name,
  value,
  placeholder,
  children,
}: {
  label: string;
  name: string;
  value: string;
  placeholder: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`f-${name}`} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <select id={`f-${name}`} name={name} defaultValue={value} className={inputClass}>
        {placeholder !== null && <option value="">{placeholder}</option>}
        {children}
      </select>
    </div>
  );
}
