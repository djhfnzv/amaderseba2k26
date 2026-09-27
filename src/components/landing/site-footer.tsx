import Link from "next/link";
import { navLinks, site } from "@/lib/site";
import { AlertIcon } from "./icons";
import { Logo } from "./logo";

export function EmergencyNotice() {
  return (
    <div role="note" className="border-y border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-4 text-sm text-amber-900 sm:items-center sm:px-6">
        <AlertIcon className="size-5 shrink-0 text-amber-700" />
        <p>
          <strong className="font-semibold">Medical emergency?</strong> MedLife is not an emergency
          service. Go to the nearest hospital or call your local emergency number immediately.
        </p>
      </div>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <Logo tone="light" />
          <p className="mt-3 max-w-xs text-sm text-slate-400">{site.description}</p>
        </div>
        <nav aria-label="Footer">
          <p className="text-sm font-semibold text-white">Explore</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {navLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold text-white">Account</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link href={site.loginHref} className="hover:text-white">
                Log in / Sign up
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-slate-400 sm:px-6">
          © {new Date().getFullYear()} {site.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
