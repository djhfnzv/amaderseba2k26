import type { MedicalFileMime } from "@/types/database";

/** Document uploads (medical reports, verification documents): PDF/JPG/PNG up to 10 MB. */
export const DOCUMENT_TYPES: Record<MedicalFileMime, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // matches bucket + DB limits

export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export function isDocumentMime(value: string | undefined | null): value is MedicalFileMime {
  return !!value && Object.hasOwn(DOCUMENT_TYPES, value);
}

/** Client-side pre-check; the server re-checks what storage actually holds. */
export function checkDocumentFile(file: File | null): string | null {
  if (!file || file.size === 0) return "Choose a file to upload.";
  if (!isDocumentMime(file.type)) return "Only PDF, JPG and PNG files are allowed.";
  if (file.size > MAX_DOCUMENT_BYTES) return "Files must be 10 MB or smaller.";
  return null;
}
