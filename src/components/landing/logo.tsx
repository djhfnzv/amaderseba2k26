import Link from "next/link";
import { site } from "@/lib/site";

export function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={`${site.name} home`}>
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
