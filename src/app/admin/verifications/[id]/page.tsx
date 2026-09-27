import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DoctorAvatar } from "@/components/doctor/doctor-avatar";
import { DocumentList } from "@/components/verification/document-list";
import { StatusPill } from "@/components/verification/status-pill";
import { requireRole } from "@/lib/auth/guards";
import { doctorPhotoUrl, formatFee, summarizeItem, yearsOfExperience } from "@/lib/doctor/constants";
import { formatDateTime } from "@/lib/format";
import { EVENT_LABEL, REQUIRED_DOC_TYPES, DOC_TYPE_LABEL } from "@/lib/verification/constants";
import { getRequestDetail } from "@/lib/verification/queries";
import { ReviewPanel } from "./review-panel";

export const metadata: Metadata = { title: "Review verification · Admin · MedLife" };

export default async function ReviewRequestPage({ params }: PageProps<"/admin/verifications/[id]">) {
  await requireRole("admin", "/admin/verifications");
  const { id } = await params;
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await getRequestDetail(id) : null;
  if (!detail) notFound();

  const { request, profile, account, details, documents, events } = detail;
  const missingDocs = REQUIRED_DOC_TYPES.filter((t) => !documents.some((d) => d.doc_type === t));
  const years = yearsOfExperience(profile.practice_since_year);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/verifications" className="text-sm font-medium text-teal-700 hover:underline">
        ← Back to queue
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <DoctorAvatar name={profile.display_name} photoUrl={doctorPhotoUrl(profile.photo_path)} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{profile.display_name}</h1>
            <StatusPill status={request.status} />
          </div>
          <p className="text-slate-600">{profile.headline ?? "No headline"}</p>
        </div>
        <Link
          href={`/doctors/${profile.slug}`}
          target="_blank"
          className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          View portfolio ↗
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_18rem] @5xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Details to check">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Row label="License (BMDC) number" value={profile.license_number} highlight />
              <Row label="Account name" value={account.full_name} />
              <Row label="Email" value={account.email} />
              <Row label="Account status" value={account.status} />
              <Row label="Joined" value={formatDateTime(account.created_at)} />
              <Row label="Experience" value={years != null ? `${years} years (since ${profile.practice_since_year})` : null} />
              <Row label="Specialties" value={details.specialties.map((s) => s.name).join(", ")} />
              <Row
                label="Fees"
                value={[
                  profile.offers_online && `Online ${formatFee(profile.fee_online)}`,
                  profile.offers_in_person && `In-person ${formatFee(profile.fee_in_person)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            </dl>
            {details.education.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-500">Education claimed</p>
                <ul className="mt-1 flex flex-col gap-1 text-sm text-slate-800">
                  {details.education.map((e) => {
                    const s = summarizeItem("education", e);
                    return (
                      <li key={e.id}>
                        <span className="font-medium">{s.primary}</span> — {s.secondary}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Documents ({documents.length})</h2>
            {missingDocs.length > 0 && (
              <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Missing: {missingDocs.map((t) => DOC_TYPE_LABEL[t]).join(", ")}
              </p>
            )}
            <DocumentList documents={documents} />
            <p className="mt-2 text-xs text-slate-500">Links open for 60 seconds.</p>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 @4xl:sticky @4xl:top-6 @4xl:self-start">
          <Card title="Decision">
            <ReviewPanel requestId={request.id} status={request.status} />
            {request.rejection_reason && request.status === "rejected" && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">
                Last reason: “{request.rejection_reason}”
              </p>
            )}
          </Card>

          <Card title="History">
            {events.length === 0 ? (
              <p className="text-sm text-slate-600">No activity yet.</p>
            ) : (
              <ol className="flex flex-col gap-3 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                    <p className="font-medium text-slate-900">{EVENT_LABEL[e.action]}</p>
                    <p className="text-slate-500">
                      {formatDateTime(e.created_at)}
                      {e.actorName && ` · ${e.actorName}`}
                    </p>
                    {e.reason && <p className="mt-1 text-slate-700">“{e.reason}”</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-teal-50" : "bg-slate-50"}`}>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-900">{value || "—"}</dd>
    </div>
  );
}
