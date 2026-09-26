import Link from "next/link";
import { site } from "@/lib/site";
import { CheckIcon, StethoscopeIcon } from "./icons";

const benefits = [
  "A public, SEO-friendly portfolio with your degrees, chambers and reviews",
  "Weekly schedule, slot duration and leave days — no double bookings",
  "Video consultations with chat and file sharing",
  "Fast e-prescriptions with medicine search, templates and allergy warnings",
  "Earnings dashboard and payout history",
];

export function ForDoctors() {
  return (
    <section id="for-doctors" className="scroll-mt-20 bg-slate-50 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-10 overflow-hidden rounded-3xl bg-teal-800 px-6 py-12 text-white sm:px-10 lg:grid-cols-2 lg:px-14">
          <div>
            <span className="grid size-12 place-items-center rounded-xl bg-white/10">
              <StethoscopeIcon className="size-7" />
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              Are you a doctor?
            </h2>
            <p className="mt-4 text-lg text-teal-50">
              Build your verified e-portfolio, reach more patients and run your practice online.
            </p>
            <Link
              href={site.loginHref}
              className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-white px-6 font-semibold text-teal-800 transition-colors hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Join as a doctor
            </Link>
          </div>
          <ul className="flex flex-col gap-4">
            {benefits.map((b) => (
              <li key={b} className="flex gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/15">
                  <CheckIcon className="size-4" />
                </span>
                <span className="text-teal-50">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
