import Link from "next/link";
import { site } from "@/lib/site";

/** Brand mark. Links to the landing page, or to `href` (e.g. the dashboard home when signed in). */
export function Logo({
  tone = "dark",
  href = "/",
  transitionTypes,
}: {
  tone?: "dark" | "light";
  href?: string;
  transitionTypes?: string[];
}) {
  return (
    <Link
      href={href}
      transitionTypes={transitionTypes}
      className="flex items-center gap-2"
      aria-label={href === "/" ? `${site.name} home` : `${site.name} dashboard`}
    >
      <span className="grid size-8 place-items-center rounded-lg bg-teal-700 text-white">
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4Z" />
        </svg>
      </span>
      <span
        className={`text-lg font-bold tracking-tight ${tone === "light" ? "text-white" : "text-slate-900"}`}
      >
        {site.name}
      </span>
    </Link>
  );
}
