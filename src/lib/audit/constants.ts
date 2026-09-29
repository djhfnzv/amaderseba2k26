import type { AuditCategory } from "@/types/database";

// Client-safe labels for audit entries (admin log + patient access history).

export const AUDIT_CATEGORIES: { value: AuditCategory; label: string }[] = [
  { value: "medical", label: "Medical data" },
  { value: "prescription", label: "Prescriptions" },
  { value: "verification", label: "Verification" },
  { value: "security", label: "Security" },
  { value: "admin", label: "Admin actions" },
];

export const CATEGORY_LABEL = Object.fromEntries(AUDIT_CATEGORIES.map((c) => [c.value, c.label])) as Record<AuditCategory, string>;

export const CATEGORY_TONE: Record<AuditCategory, string> = {
  medical: "bg-sky-50 text-sky-800",
  prescription: "bg-teal-50 text-teal-800",
  verification: "bg-violet-50 text-violet-800",
  security: "bg-amber-50 text-amber-800",
  admin: "bg-slate-100 text-slate-700",
};

/** action -> [category, label]. Unknown actions fall back to the raw name. */
export const AUDIT_ACTIONS: Record<string, [AuditCategory, string]> = {
  "health_profile.view": ["medical", "Viewed health profile & reports"],
  "health_profile.create": ["medical", "Created health profile"],
  "health_profile.update": ["medical", "Updated health profile"],
  "medical_file.view": ["medical", "Opened a report"],
  "medical_file.download": ["medical", "Downloaded a report"],
  "medical_file.upload": ["medical", "Uploaded a report"],
  "medical_file.update": ["medical", "Edited report details"],
  "medical_file.delete": ["medical", "Deleted a report"],
  "consult_notes.update": ["medical", "Edited consultation notes"],
  "consult_file.share": ["medical", "Shared a file in a consultation"],
  "consult_file.view": ["medical", "Opened a consultation file"],
  "consult_file.download": ["medical", "Downloaded a consultation file"],
  "advice.create": ["medical", "Sent advice"],

  "prescription.create": ["prescription", "Started a prescription"],
  "prescription.amend": ["prescription", "Started an amendment"],
  "prescription.edit": ["prescription", "Edited a draft prescription"],
  "prescription.sign": ["prescription", "Signed a prescription"],
  "prescription.replace": ["prescription", "Prescription replaced by a new version"],
  "prescription.delete_draft": ["prescription", "Deleted a draft prescription"],
  "prescription.view": ["prescription", "Viewed a prescription"],
  "prescription.pdf": ["prescription", "Opened a prescription PDF"],
  "prescription.download": ["prescription", "Downloaded a prescription PDF"],

  "verification_doc.upload": ["verification", "Uploaded a verification document"],
  "verification_doc.delete": ["verification", "Deleted a verification document"],
  "verification_doc.view": ["verification", "Opened a verification document"],
  "verification_doc.download": ["verification", "Downloaded a verification document"],
  "verification.submitted": ["verification", "Submitted for verification"],
  "verification.approved": ["verification", "Approved a doctor"],
  "verification.rejected": ["verification", "Rejected a verification request"],
  "verification.revoked": ["verification", "Revoked a doctor's verification"],

  "login.success": ["security", "Logged in"],
  "login.failed": ["security", "Failed login"],
  "login.blocked": ["security", "Blocked login (suspended)"],
  "logout": ["security", "Logged out"],
  "password.reset_request": ["security", "Requested a password reset"],
  "password.change": ["security", "Changed password"],
  "account.signup": ["security", "Account created"],
  "account.suspend": ["security", "Account suspended"],
  "account.reactivate": ["security", "Account reactivated"],
  "account.role_change": ["security", "Role changed"],

  "settings.update": ["admin", "Changed platform settings"],
  "payout.record": ["admin", "Recorded a payout"],
  "refund.pending": ["admin", "Refund started"],
  "refund.processing": ["admin", "Refund processing"],
  "refund.succeeded": ["admin", "Refund completed"],
  "refund.failed": ["admin", "Refund failed"],
  "review.hidden": ["admin", "Hid a review"],
  "review.restored": ["admin", "Restored a review"],
  "review.dismissed": ["admin", "Dismissed a review flag"],
  "medicine.add": ["admin", "Added a medicine"],
  "medicine.import": ["admin", "Imported medicines"],
  "medicine.update": ["admin", "Changed a medicine"],
  "audit.export": ["admin", "Exported the audit log"],
  "audit.purge": ["admin", "Old audit entries removed (retention)"],
};

export function actionLabel(action: string): string {
  return AUDIT_ACTIONS[action]?.[1] ?? action;
}

export const ACTION_OPTIONS = AUDIT_CATEGORIES.map((c) => ({
  label: c.label,
  options: Object.entries(AUDIT_ACTIONS)
    .filter(([, [cat]]) => cat === c.value)
    .map(([value, [, label]]) => ({ value, label })),
}));

/** "Chrome on Windows" style summary of a user-agent string. */
export function shortUserAgent(ua: string | null): string {
  if (!ua) return "—";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : /node|undici|curl|axios/i.test(ua)
              ? "Script"
              : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

/** Retention shown to admins (matches purge_audit_logs default). */
export const AUDIT_RETENTION_DAYS = 730;

/** Rows per page on the patient's access history. */
export const ACCESS_PAGE_SIZE = 30;
