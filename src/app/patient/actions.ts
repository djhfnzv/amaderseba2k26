"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { isDocumentMime } from "@/lib/files";
import { flash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_BYTES,
  MEDICAL_FILES_BUCKET,
} from "@/lib/patient/constants";
import {
  healthProfileSchema,
  medicalFileSchema,
  uploadRequestSchema,
} from "@/lib/validation/patient";
import {
  fieldErrorsOf,
  formToObject,
  type FormState,
} from "@/lib/validation/form-state";
import type { MedicalFileMime } from "@/types/database";

// -----------------------------------------------------------------------------
// Health profile
// -----------------------------------------------------------------------------
export async function saveHealthProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("patient");
  const raw = formToObject(formData);
  const parsed = healthProfileSchema.safeParse({
    ...raw,
    allergies: formData.getAll("allergies").map(String),
    chronicConditions: formData.getAll("chronicConditions").map(String),
  });
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsOf(parsed.error),
      error: "Please fix the highlighted fields.",
      values: raw,
    };
  }
  const p = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("patient_profiles").upsert({
    user_id: user.id,
    date_of_birth: p.dateOfBirth,
    sex: p.sex,
    weight_kg: p.weightKg,
    height_cm: p.heightCm,
    blood_group: p.bloodGroup,
    allergies: p.allergies,
    chronic_conditions: p.chronicConditions,
    emergency_contact_name: p.emergencyContactName,
    emergency_contact_phone: p.emergencyContactPhone,
  });

  if (error) {
    console.error("[saveHealthProfile]", error);
    return { error: "Could not save your profile. Please try again.", values: raw };
  }

  revalidatePath("/patient", "layout");

  // First-time setup continues to the optional reports step.
  if (raw.welcome === "1") redirect("/patient/records?welcome=1");
  await flash("Health profile saved");
  return { message: "Your health profile has been saved." };
}

// -----------------------------------------------------------------------------
// Medical files
// Upload flow: requestUpload() -> browser uploads to the signed URL ->
// saveMedicalFile() verifies the stored object and records it.
// -----------------------------------------------------------------------------
export type UploadTicket = { path: string; token: string } | { error: string };

export async function requestUpload(input: {
  fileName: string;
  mimeType: string;
  size: number;
}): Promise<UploadTicket> {
  const user = await requireRole("patient");
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "This file can't be uploaded." };
  }

  const ext = ALLOWED_FILE_TYPES[parsed.data.mimeType as MedicalFileMime];
  // Path is chosen by the server, inside the user's own folder.
  const path = `${user.id}/${randomUUID()}.${ext}`;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(MEDICAL_FILES_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("[requestUpload]", error);
    return { error: "Could not start the upload. Please try again." };
  }
  return { path: data.path, token: data.token };
}

export async function saveMedicalFile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("patient");
  const raw = formToObject(formData);
  const parsed = medicalFileSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error), values: raw };
  }
  const f = parsed.data;

  if (!f.storagePath.startsWith(`${user.id}/`)) {
    return { error: "Invalid upload. Please try again." };
  }

  const supabase = await createClient();
  const bucket = supabase.storage.from(MEDICAL_FILES_BUCKET);

  // Trust what storage actually holds, not what the browser claimed.
  const { data: info, error: infoError } = await bucket.info(f.storagePath);
  const mime = info?.contentType as MedicalFileMime | undefined;
  const size = info?.size ?? 0;
  if (infoError || !info || !isDocumentMime(mime) || size <= 0 || size > MAX_FILE_BYTES) {
    await bucket.remove([f.storagePath]);
    return { error: "The upload didn't complete or the file type isn't allowed. Please try again." };
  }

  const { error } = await supabase.from("medical_files").insert({
    title: f.title,
    category: f.category,
    report_date: f.reportDate,
    notes: f.notes,
    storage_path: f.storagePath,
    file_name: f.fileName,
    mime_type: mime,
    size_bytes: size,
  });

  if (error) {
    console.error("[saveMedicalFile]", error);
    await bucket.remove([f.storagePath]);
    return { error: "Could not save the report. Please try again.", values: raw };
  }

  revalidatePath("/patient", "layout");
  await flash("Report uploaded");
  return { message: `"${f.title}" was uploaded.` };
}

export async function deleteMedicalFile(formData: FormData): Promise<void> {
  await requireRole("patient");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // RLS limits this to the patient's own files.
  const { data: file } = await supabase
    .from("medical_files")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!file) return;

  const { error } = await supabase.from("medical_files").delete().eq("id", file.id);
  if (!error) {
    await supabase.storage.from(MEDICAL_FILES_BUCKET).remove([file.storage_path]);
    await flash("Report deleted");
  }

  revalidatePath("/patient", "layout");
}
