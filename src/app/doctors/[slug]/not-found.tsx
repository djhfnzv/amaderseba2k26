import Link from "next/link";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

export default function DoctorNotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-20">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900">Doctor not found</h1>
          <p className="mt-2 text-slate-600">
            This page doesn&apos;t exist, or the doctor&apos;s profile isn&apos;t public yet.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-11 items-center rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Back to home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
