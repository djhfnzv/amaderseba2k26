import { DeleteFileButton } from "./delete-file-button";
import { formatBytes, formatDate } from "@/lib/format";
import { FILE_CATEGORY_LABEL } from "@/lib/patient/constants";
import type { MedicalFile } from "@/types/database";

export function FileList({
  files,
  showDelete = true,
}: {
  files: MedicalFile[];
  showDelete?: boolean;
}) {
  if (files.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
        No reports uploaded yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
      {files.map((f) => (
        <li key={f.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <FileBadge mime={f.mime_type} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-900">{f.title}</p>
            <p className="text-sm text-slate-600">
              {FILE_CATEGORY_LABEL[f.category]}
              {f.report_date && <> · {formatDate(f.report_date)}</>} · {formatBytes(f.size_bytes)}
            </p>
            {f.notes && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{f.notes}</p>}
          </div>
          <div className="flex items-center gap-1 sm:shrink-0">
            <a
              href={`/patient/records/${f.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              Open
            </a>
            <a
              href={`/patient/records/${f.id}/file?download=1`}
              className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              Download
            </a>
            {showDelete && <DeleteFileButton id={f.id} title={f.title} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function FileBadge({ mime }: { mime: MedicalFile["mime_type"] }) {
  const isPdf = mime === "application/pdf";
  return (
    <span
      aria-hidden="true"
      className={`grid size-11 shrink-0 place-items-center rounded-lg text-xs font-bold ${
        isPdf ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700"
      }`}
    >
      {isPdf ? "PDF" : "IMG"}
    </span>
  );
}
