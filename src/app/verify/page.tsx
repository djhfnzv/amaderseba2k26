import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `Verify a prescription · ${site.name}`,
  description: "Check that a MedLife prescription is genuine and still current using the ID printed under its QR code.",
};

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const { code } = await searchParams;
  if (typeof code === "string" && code.trim()) {
    redirect(`/verify/${encodeURIComponent(code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}`);
  }

  return (
    <>
      <SiteHeader />
      <main className="page-container flex flex-1 flex-col items-center py-16">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Verify a prescription</h1>
          <p className="mt-2 text-slate-600">
            Scan the QR code on the prescription, or type the 10-character ID printed next to it.
          </p>
          <form className="mt-6 flex flex-col gap-3" role="search">
            <label htmlFor="code" className="text-sm font-medium text-slate-800">Prescription ID</label>
            <input
              id="code"
              name="code"
              required
              maxLength={12}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="e.g. 3FA9C21B7D"
              className="h-12 rounded-lg border border-slate-300 bg-white px-3 font-mono text-lg tracking-widest text-slate-900 uppercase outline-none focus:ring-2 focus:ring-teal-600"
            />
            <button type="submit" className="h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
              Check
            </button>
          </form>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
