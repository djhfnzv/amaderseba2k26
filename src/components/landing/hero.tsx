import Link from "next/link";
import { AuthLink } from "@/components/motion/auth-transition";
import { SearchBar } from "@/components/search/search-bar";
import { site } from "@/lib/site";
import {
  CalendarIcon,
  CheckIcon,
  ShieldCheckIcon,
  StarIcon,
  VideoIcon,
} from "./icons";

const highlights = ["Admin-verified doctors", "Video or in-person visits", "Signed e-prescriptions"];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-teal-50 via-white to-white">
      <div className="page-container grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-2 lg:py-24 2xl:gap-20">
        <div className="animate-fade-up">
          <p className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white px-3 py-1 text-xs font-medium text-teal-800">
            <ShieldCheckIcon className="size-4" />
            Every doctor is license-verified
          </p>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem] lg:leading-[1.1]">
            See a trusted doctor,{" "}
            <span className="text-teal-700">online or in person.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            Browse rich, verified doctor portfolios, book a slot in a few taps, consult over secure
            video and get a signed digital prescription — all in one place.
          </p>

          <div className="mt-8 max-w-xl">
            <SearchBar size="lg" />
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <AuthLink
              href={site.signupHref}
              className="inline-flex h-12 items-center justify-center rounded-lg bg-teal-700 px-6 font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Get started
            </AuthLink>
            <Link
              href="/doctors"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-6 font-semibold text-slate-800 transition-colors hover:bg-slate-50"
            >
              Browse all doctors
            </Link>
          </div>

          <ul className="mt-8 flex flex-col gap-2 text-sm text-slate-700 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {highlights.map((h) => (
              <li key={h} className="flex items-center gap-2">
                <CheckIcon className="size-4 text-teal-700" />
                {h}
              </li>
            ))}
          </ul>
        </div>

        <DoctorPreviewCard />
      </div>
    </section>
  );
}

/** Illustrative portfolio card showing what patients will see. */
function DoctorPreviewCard() {
  const slots = ["10:00", "10:20", "11:00", "11:40"];
  return (
    <div className="relative mx-auto w-full max-w-md animate-fade-up [animation-delay:150ms] lg:mr-0 xl:max-w-lg" aria-hidden="true">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-teal-100/60 blur-2xl" />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-600 to-cyan-600 text-xl font-bold text-white">
            NR
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate font-semibold text-slate-900">Dr. Nadia Rahman</p>
              <ShieldCheckIcon className="size-4 shrink-0 text-teal-700" />
            </div>
            <p className="text-sm text-slate-600">Cardiologist · MBBS, FCPS</p>
            <div className="mt-1 flex items-center gap-1 text-sm">
              <StarIcon className="size-4 text-amber-500" />
              <span className="font-medium text-slate-900">4.9</span>
              <span className="text-slate-500">(312 reviews)</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-slate-500">Experience</p>
            <p className="font-semibold text-slate-900">12 years</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-slate-500">Consultation fee</p>
            <p className="font-semibold text-slate-900">৳ 800</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm">
            <p className="flex items-center gap-1.5 font-medium text-slate-900">
              <CalendarIcon className="size-4 text-teal-700" />
              Available today
            </p>
            <p className="flex items-center gap-1.5 text-slate-600">
              <VideoIcon className="size-4" />
              Online
            </p>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {slots.map((s, i) => (
              <span
                key={s}
                className={`rounded-lg border py-2 text-center text-sm font-medium ${
                  i === 1
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-200 text-slate-700"
                }`}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-teal-700 py-2.5 text-center text-sm font-semibold text-white">
          Book 10:20 AM
        </div>
      </div>
    </div>
  );
}
