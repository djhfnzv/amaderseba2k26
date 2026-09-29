import { LocalTime } from "@/components/ui/local-time";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/complaints/constants";
import type { ComplaintDetail } from "@/lib/complaints/queries";
import type { ComplaintStatus } from "@/types/database";

export function ComplaintStatusPill({ status }: { status: ComplaintStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** The complaint's conversation. `viewer` decides whose messages sit on the right. */
export function ComplaintThread({
  complaint,
  viewer,
}: {
  complaint: ComplaintDetail;
  viewer: "admin" | "complainant";
}) {
  const mine = (role: string) => (viewer === "admin" ? role === "admin" : role !== "admin" && role !== "system");

  return (
    <ol className="flex flex-col gap-4">
      <li className="flex animate-row-in flex-col items-start">
        <span className="mb-1 text-xs text-slate-500">
          {viewer === "admin" ? (complaint.complainant?.full_name || complaint.complainant?.email || "Complainant") : "You"} ·{" "}
          <LocalTime iso={complaint.created_at} />
        </span>
        <div className="max-w-full rounded-2xl rounded-tl-sm border border-slate-200 bg-slate-50 px-4 py-3 text-sm whitespace-pre-line text-slate-900">
          <p className="mb-1 font-semibold">{complaint.subject}</p>
          {complaint.description}
        </div>
      </li>

      {complaint.messages.map((m, i) => {
        if (m.kind !== "message") {
          return (
            <li
              key={m.id}
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
              className="flex animate-row-in items-center gap-3 text-xs text-slate-500"
            >
              <span className="h-px flex-1 bg-slate-200" />
              <span
                className={`max-w-[80%] rounded-full px-3 py-1 text-center ${
                  m.kind === "refund" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"
                }`}
              >
                {m.body} · <LocalTime iso={m.created_at} format="dayMonth" />
              </span>
              <span className="h-px flex-1 bg-slate-200" />
            </li>
          );
        }
        const right = mine(m.author_role);
        return (
          <li
            key={m.id}
            style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
            className={`flex animate-row-in flex-col ${right ? "items-end" : "items-start"}`}
          >
            <span className="mb-1 text-xs text-slate-500">
              {m.author_role === "admin"
                ? viewer === "admin"
                  ? (m.author_name ?? "Admin")
                  : "MedLife support"
                : viewer === "admin"
                  ? (m.author_name ?? "Complainant")
                  : "You"}
              {m.is_internal && <span className="ml-1 font-semibold text-amber-700">· internal note</span>} ·{" "}
              <LocalTime iso={m.created_at} />
            </span>
            <p
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                m.is_internal
                  ? "rounded-tr-sm border border-dashed border-amber-300 bg-amber-50 text-amber-950"
                  : right
                    ? "rounded-tr-sm bg-teal-700 text-white"
                    : "rounded-tl-sm border border-slate-200 bg-white text-slate-900"
              }`}
            >
              {m.body}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
