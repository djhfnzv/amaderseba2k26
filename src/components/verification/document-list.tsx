import { formatBytes } from "@/lib/format";
import { DOC_TYPE_LABEL } from "@/lib/verification/constants";
import type { VerificationDocument } from "@/types/database";
import { DeleteDocumentButton } from "./delete-document-button";

/** Verification documents, openable by the owning doctor or an admin. */
export function DocumentList({
  documents,
  canDelete = false,
}: {
  documents: VerificationDocument[];
  canDelete?: boolean;
}) {
  if (documents.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
        No documents uploaded yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
      {documents.map((d) => (
        <li key={d.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <span
            aria-hidden="true"
            className={`grid size-10 shrink-0 place-items-center rounded-lg text-xs font-bold ${
              d.mime_type === "application/pdf" ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700"
            }`}
          >
            {d.mime_type === "application/pdf" ? "PDF" : "IMG"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">
              {DOC_TYPE_LABEL[d.doc_type]}
              {d.label && <span className="font-normal text-slate-600"> — {d.label}</span>}
            </p>
            <p className="truncate text-sm text-slate-500">
              {d.file_name} · {formatBytes(d.size_bytes)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={`/verification-documents/${d.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              Open
            </a>
            <a
              href={`/verification-documents/${d.id}?download=1`}
              className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              Download
            </a>
            {canDelete && <DeleteDocumentButton id={d.id} label={DOC_TYPE_LABEL[d.doc_type]} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
