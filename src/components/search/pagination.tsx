import Link from "next/link";
import { PAGE_SIZE, searchUrl, type SearchFilters } from "@/lib/search/params";

export function Pagination({ filters, total }: { filters: SearchFilters; total: number }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  const { page } = filters;

  // Current page ±2, plus first/last.
  const nums = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);

  const link = "grid h-10 min-w-10 place-items-center rounded-lg px-3 text-sm font-medium";

  return (
    <nav aria-label="Search results pages" className="flex flex-wrap items-center justify-center gap-1">
      {page > 1 && (
        <Link href={searchUrl({ ...filters, page: page - 1 })} className={`${link} text-slate-700 hover:bg-slate-100`}>
          ← Prev
        </Link>
      )}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-slate-400">…</span>}
          <Link
            href={searchUrl({ ...filters, page: n })}
            aria-current={n === page ? "page" : undefined}
            className={`${link} ${n === page ? "bg-teal-700 text-white" : "text-slate-700 hover:bg-slate-100"}`}
          >
            {n}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link href={searchUrl({ ...filters, page: page + 1 })} className={`${link} text-slate-700 hover:bg-slate-100`}>
          Next →
        </Link>
      )}
    </nav>
  );
}
