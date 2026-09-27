import type { Metadata } from "next";
import Link from "next/link";
import { DocumentList } from "@/components/verification/document-list";
import { StatusPill } from "@/components/verification/status-pill";
import { requireRole } from "@/lib/auth/guards";
import { getOrCreateOwnProfile, getPortfolioDetails } from "@/lib/doctor/queries";
import { formatDateTime } from "@/lib/format";
import { DOC_TYPES, EVENT_LABEL, isEditable } from "@/lib/verification/constants";
import { getOrCreateOwnRequest, listDocuments, listEvents } from "@/lib/verification/queries";
import { DocumentUploader } from "./document-uploader";
import { SubmitForm } from "./submit-form";

export const metadata: Metadata = { title: "Verification · MedLife" };

export default async function DoctorVerificationPage() {
  const user = await requireRole("doctor", "/doctor/verification");
  const profile = await getOrCreateOwnProfile(user);
  const request = await getOrCreateOwnRequest(user.id);
  const [documents, events, details] = await Promise.all([
    listDocuments(request.id),
    listEvents(request.id),
    getPortfolioDetails(user.id),
  ]);

  const editable = isEditable(request.status);
  const has = (type: string) => documents.some((d) => d.doc_type === type);
  const checklist = [
    ...DOC_TYPES.filter((d) => d.required).map((d) => ({ label: d.label, done: has(d.value), href: null })),
    { label: "License number in portfolio", done: !!profile.license_number?.trim(), href: "/doctor/portfolio" },
    { label: "Specialty in portfolio", done: details.specialties.length > 0, href: "/doctor/portfolio" },
  ];
  const ready = checklist.every((c) => c.done);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Verification</h1>
          <StatusPill status={request.status} />
        </div>
        <p className="mt-1 text-slate-600">
          We verify every doctor before their page goes public. Your documents are private — only
          you and MedLife admins can see them.
        </p>
      </div>

      <StatusBanner status={request.status} reason={request.rejection_reason} slug={profile.slug} submittedAt={request.submitted_at} />

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_18rem] @5xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          {editable && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-slate-900">Checklist</h2>
                <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  {checklist.map((c) => (
                    <li key={c.label} className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`grid size-5 place-items-center rounded-full text-xs font-bold ${
                          c.done ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {c.done ? "✓" : ""}
                      </span>
                      {c.href && !c.done ? (
                        <Link href={c.href} className="text-teal-700 underline">
                          {c.label}
                        </Link>
                      ) : (
                        <span className="text-slate-800">{c.label}</span>
                      )}
                      <span className="sr-only">{c.done ? "(done)" : "(to do)"}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-slate-900">Upload a document</h2>
                <div className="mt-4">
                  <DocumentUploader />
                </div>
              </section>
            </>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              Your documents <span className="font-normal text-slate-500">({documents.length})</span>
            </h2>
            <DocumentList documents={documents} canDelete={editable} />
          </section>

          {editable && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">Submit</h2>
              <p className="mt-1 text-sm text-slate-600">
                After you submit, your documents are locked until an admin reviews them.
              </p>
              <div className="mt-4">
                <SubmitForm ready={ready} resubmit={request.status === "rejected"} />
              </div>
            </section>
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-6 @4xl:self-start">
          {events.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">History</h2>
              <ol className="mt-4 flex flex-col gap-3 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                    <p className="font-medium text-slate-900">{EVENT_LABEL[e.action]}</p>
                    <p className="text-slate-500">{formatDateTime(e.created_at)}</p>
                    {e.reason && <p className="mt-1 text-slate-700">“{e.reason}”</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {events.length === 0 && (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">How it works</h2>
              <ol className="mt-3 list-decimal space-y-1 pl-5">
                <li>Upload your license, degree and national ID.</li>
                <li>Submit — documents lock while we review.</li>
                <li>Once approved, your page goes public and patients can book.</li>
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatusBanner({
  status,
  reason,
  slug,
  submittedAt,
}: {
  status: string;
  reason: string | null;
  slug: string;
  submittedAt: string | null;
}) {
  if (status === "pending") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong className="font-semibold">Under review.</strong> Submitted{" "}
        {submittedAt ? formatDateTime(submittedAt) : ""}. We usually review within 1–2 working days.
      </div>
    );
  }
  if (status === "approved") {
    return (
      <div className="flex flex-col gap-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong className="font-semibold">You&apos;re verified.</strong> Your page is public.
        </p>
        <Link href={`/doctors/${slug}`} className="font-semibold underline">
          View your page
        </Link>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p>
          <strong className="font-semibold">Changes needed.</strong> Please fix the issue below,
          update your documents and resubmit.
        </p>
        {reason && <p className="mt-2 rounded-lg bg-white/70 p-3 text-red-900">“{reason}”</p>}
      </div>
    );
  }
  return null;
}
