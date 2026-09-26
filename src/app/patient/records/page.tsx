import type { Metadata } from "next";
import Link from "next/link";
import { FileList } from "@/components/patient/file-list";
import { WelcomeSteps } from "@/components/patient/welcome-steps";
import { requireRole } from "@/lib/auth/guards";
import { listMedicalFiles } from "@/lib/patient/queries";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Medical records · MedLife" };

export default async function MedicalRecordsPage({ searchParams }: PageProps<"/patient/records">) {
  await requireRole("patient", "/patient/records");
  const [{ welcome }, files] = await Promise.all([searchParams, listMedicalFiles()]);
  const isWelcome = welcome === "1";

  return (
    <div className="mx-auto max-w-4xl">
      {isWelcome && <WelcomeSteps current={2} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Medical records
          </h1>
          <p className="mt-1 text-slate-600">
            Upload past reports so your doctors have the full picture. Files are stored privately.
          </p>
        </div>
        {isWelcome && (
          <Link
            href="/patient"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {files.length ? "Finish" : "Skip for now"}
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-2 lg:self-start">
          <h2 className="text-lg font-semibold text-slate-900">Upload a report</h2>
          <div className="mt-4">
            <UploadForm />
          </div>
        </section>
        <section className="lg:col-span-3">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            Your reports <span className="font-normal text-slate-500">({files.length})</span>
          </h2>
          <FileList files={files} />
        </section>
      </div>
    </div>
  );
}
