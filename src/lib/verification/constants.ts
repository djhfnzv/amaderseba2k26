import type { VerificationAction, VerificationDocType, VerificationStatus } from "@/types/database";

export const VERIFICATION_BUCKET = "verification-docs";

export const DOC_TYPES: { value: VerificationDocType; label: string; hint: string; required: boolean }[] = [
  {
    value: "license",
    label: "Medical license",
    hint: "BMDC registration certificate or current license",
    required: true,
  },
  { value: "degree", label: "Degree certificate", hint: "MBBS/BDS and any postgraduate degrees", required: true },
  { value: "national_id", label: "National ID", hint: "NID or passport (photo page)", required: true },
  { value: "other", label: "Other", hint: "Anything else that supports your application", required: false },
];

export const DOC_TYPE_LABEL = Object.fromEntries(DOC_TYPES.map((d) => [d.value, d.label])) as Record<
  VerificationDocType,
  string
>;

export const REQUIRED_DOC_TYPES = DOC_TYPES.filter((d) => d.required).map((d) => d.value);

export const MAX_DOCUMENTS = 15;

export const STATUS_META: Record<VerificationStatus | "none", { label: string; tone: string }> = {
  none: { label: "Not submitted", tone: "bg-slate-100 text-slate-700" },
  draft: { label: "Not submitted", tone: "bg-slate-100 text-slate-700" },
  pending: { label: "Under review", tone: "bg-amber-100 text-amber-900" },
  approved: { label: "Verified", tone: "bg-emerald-100 text-emerald-900" },
  rejected: { label: "Changes needed", tone: "bg-red-100 text-red-800" },
};

export const EVENT_LABEL: Record<VerificationAction, string> = {
  submitted: "Submitted for review",
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Verification revoked",
};

/** Doctors can change documents only before submitting or after a rejection. */
export function isEditable(status: VerificationStatus | undefined): boolean {
  return !status || status === "draft" || status === "rejected";
}
