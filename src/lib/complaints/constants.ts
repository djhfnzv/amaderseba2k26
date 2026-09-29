import type { ComplaintCategory, ComplaintPriority, ComplaintStatus, Role } from "@/types/database";

export const COMPLAINT_CATEGORIES: { value: ComplaintCategory; label: string; roles: Role[] }[] = [
  { value: "appointment", label: "Appointment or scheduling", roles: ["patient", "doctor"] },
  { value: "payment", label: "Payment or refund", roles: ["patient", "doctor"] },
  { value: "doctor_conduct", label: "Doctor's behaviour", roles: ["patient"] },
  { value: "patient_conduct", label: "Patient's behaviour", roles: ["doctor"] },
  { value: "prescription", label: "Prescription", roles: ["patient", "doctor"] },
  { value: "video_call", label: "Video call problem", roles: ["patient", "doctor"] },
  { value: "privacy", label: "Privacy or data", roles: ["patient", "doctor"] },
  { value: "technical", label: "Website problem", roles: ["patient", "doctor"] },
  { value: "other", label: "Something else", roles: ["patient", "doctor"] },
];

export const CATEGORY_LABEL = Object.fromEntries(COMPLAINT_CATEGORIES.map((c) => [c.value, c.label])) as Record<
  ComplaintCategory,
  string
>;

export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  rejected: "Closed",
};

export const STATUS_TONE: Record<ComplaintStatus, string> = {
  open: "bg-amber-50 text-amber-800",
  in_review: "bg-sky-50 text-sky-800",
  resolved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-slate-100 text-slate-700",
};

export const PRIORITIES: { value: ComplaintPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const PRIORITY_TONE: Record<ComplaintPriority, string> = {
  low: "text-slate-500",
  normal: "text-slate-600",
  high: "text-orange-700",
  urgent: "text-red-700",
};

export const COMPLAINT_TABS: { value: ComplaintStatus | "active" | "all"; label: string }[] = [
  { value: "active", label: "Needs action" },
  { value: "open", label: "Open" },
  { value: "in_review", label: "In review" },
  { value: "resolved", label: "Resolved" },
  { value: "rejected", label: "Closed" },
  { value: "all", label: "All" },
];
