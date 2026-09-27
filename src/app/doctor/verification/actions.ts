"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { getOrCreateOwnProfile } from "@/lib/doctor/queries";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, isDocumentMime } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";
import { MAX_DOCUMENTS, VERIFICATION_BUCKET, isEditable } from "@/lib/verification/constants";
import { getOrCreateOwnRequest } from "@/lib/verification/queries";
import { formToObject, type FormState } from "@/lib/validation/form-state";

const uploadSchema = z.object({
  mimeType: z.string().refine(isDocumentMime, "Only PDF, JPG and PNG files are allowed"),
  size: z.number().int().positive("The file is empty").max(MAX_DOCUMENT_BYTES, "Files must be 10 MB or smaller"),
});

const documentSchema = z.object({
  storagePath: z.string().min(1),
  fileName: z.string().trim().min(1).max(255),
  docType: z.enum(["license", "degree", "national_id", "other"], { error: "Choose a document type" }),
  label: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(120).nullable(),
  ),
});

function revalidate() {
  revalidatePath("/doctor", "layout");
  revalidatePath("/admin", "layout");
}

/** Step 1: a signed upload URL inside the doctor's own folder. */
export async function requestVerificationUpload(input: {
  mimeType: string;
  size: number;
}): Promise<{ path: string; token: string } | { error: string }> {
  const user = await requireRole("doctor");
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "This file can't be uploaded." };

  const request = await getOrCreateOwnRequest(user.id);
  if (!isEditable(request.status)) {
    return { error: "Your documents are locked while under review or after approval." };
  }

  const ext = DOCUMENT_TYPES[parsed.data.mimeType as keyof typeof DOCUMENT_TYPES];
  const path = `${user.id}/${randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(VERIFICATION_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[requestVerificationUpload]", error);
    return { error: "Could not start the upload. Please try again." };
  }
  return { path: data.path, token: data.token };
}

/** Step 3: record the uploaded document after checking what storage holds. */
export async function saveVerificationDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("doctor");
  const raw = formToObject(formData);
  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid document.", values: raw };
  }
  const d = parsed.data;
  if (!d.storagePath.startsWith(`${user.id}/`)) return { error: "Invalid upload. Please try again." };

  const supabase = await createClient();
  const bucket = supabase.storage.from(VERIFICATION_BUCKET);
  const request = await getOrCreateOwnRequest(user.id);

  const { count } = await supabase
    .from("verification_documents")
    .select("id", { count: "exact", head: true })
    .eq("request_id", request.id);
  if ((count ?? 0) >= MAX_DOCUMENTS) {
    await bucket.remove([d.storagePath]);
    return { error: `You can upload at most ${MAX_DOCUMENTS} documents.` };
  }

  const { data: info } = await bucket.info(d.storagePath);
  const mime = info?.contentType;
  const size = info?.size ?? 0;
  if (!info || !isDocumentMime(mime) || size <= 0 || size > MAX_DOCUMENT_BYTES) {
    await bucket.remove([d.storagePath]);
    return { error: "The upload didn't complete or the file type isn't allowed. Please try again." };
  }

  // RLS only allows this while the request is a draft or was rejected.
  const { error } = await supabase.from("verification_documents").insert({
    request_id: request.id,
    doc_type: d.docType,
    label: d.label,
    storage_path: d.storagePath,
    file_name: d.fileName,
    mime_type: mime,
    size_bytes: size,
  });
  if (error) {
    console.error("[saveVerificationDocument]", error);
    await bucket.remove([d.storagePath]);
    return { error: "Could not save the document. Please try again." };
  }

  revalidate();
  return { message: "Document uploaded." };
}

export async function deleteVerificationDocument(formData: FormData): Promise<void> {
  const user = await requireRole("doctor");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("verification_documents")
    .select("id, storage_path")
    .eq("id", id)
    .eq("doctor_id", user.id)
    .maybeSingle();
  if (!doc) return;

  // RLS refuses the delete once the request is under review or approved.
  const { error, count } = await supabase
    .from("verification_documents")
    .delete({ count: "exact" })
    .eq("id", doc.id);
  if (!error && count) {
    await supabase.storage.from(VERIFICATION_BUCKET).remove([doc.storage_path]);
  }
  revalidate();
}

export async function submitForReview(): Promise<FormState> {
  const user = await requireRole("doctor");
  await getOrCreateOwnProfile(user);
  await getOrCreateOwnRequest(user.id);

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_verification_request");
  if (error) {
    // The DB function explains what is missing ("Missing: national ID, ...").
    const friendly = error.code === "22023" || error.code === "P0002";
    if (!friendly) console.error("[submitForReview]", error);
    return {
      error: friendly ? `${error.message}.` : "Could not submit. Please try again.",
    };
  }

  revalidate();
  return { message: "Submitted! An admin will review your documents soon." };
}
