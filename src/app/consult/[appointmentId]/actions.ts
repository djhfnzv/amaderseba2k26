"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, isDocumentMime } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";
import type { ConsultationMessage } from "@/types/database";

const CONSULT_BUCKET = "consultation-files";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// All checks (participant, room open) are enforced by RLS / DB functions.

export async function sendChatMessage(appointmentId: string, body: string): Promise<Result<ConsultationMessage>> {
  await requireUser();
  const text = body.trim().slice(0, 2000);
  if (!UUID.test(appointmentId) || !text) return { ok: false, error: "Type a message first." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consultation_messages")
    .insert({ appointment_id: appointmentId, kind: "text", body: text, file_path: null, file_name: null, mime_type: null, size_bytes: null })
    .select("*")
    .single();
  if (error || !data) {
    if (error) console.error("[sendChatMessage]", error.message);
    return { ok: false, error: "The room is closed, so messages can't be sent." };
  }
  return { ok: true, data };
}

export async function requestConsultUpload(
  appointmentId: string,
  file: { mimeType: string; size: number },
): Promise<Result<{ path: string; token: string }>> {
  await requireUser();
  if (!UUID.test(appointmentId)) return { ok: false, error: "Invalid consultation." };
  if (!isDocumentMime(file.mimeType)) return { ok: false, error: "Only PDF, JPG and PNG files can be shared." };
  if (file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "Files must be 10 MB or smaller." };

  const path = `${appointmentId}/${randomUUID()}.${DOCUMENT_TYPES[file.mimeType]}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(CONSULT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "The room is closed, so files can't be shared." };
  return { ok: true, data: { path: data.path, token: data.token } };
}

export async function saveSharedFile(
  appointmentId: string,
  path: string,
  fileName: string,
): Promise<Result<ConsultationMessage>> {
  await requireUser();
  if (!UUID.test(appointmentId) || !path.startsWith(`${appointmentId}/`)) return { ok: false, error: "Invalid upload." };

  const supabase = await createClient();
  const bucket = supabase.storage.from(CONSULT_BUCKET);
  const { data: info } = await bucket.info(path);
  if (!info || !isDocumentMime(info.contentType) || !info.size || info.size > MAX_DOCUMENT_BYTES) {
    await bucket.remove([path]);
    return { ok: false, error: "The upload didn't complete or the file type isn't allowed." };
  }

  const { data, error } = await supabase
    .from("consultation_messages")
    .insert({
      appointment_id: appointmentId,
      kind: "file",
      body: null,
      file_path: path,
      file_name: fileName.slice(0, 255),
      mime_type: info.contentType,
      size_bytes: info.size,
    })
    .select("*")
    .single();
  if (error || !data) {
    await bucket.remove([path]);
    return { ok: false, error: "Could not share the file." };
  }
  return { ok: true, data };
}

/** Messages after a given time (used when the other side says "new message"). */
export async function fetchMessagesSince(appointmentId: string, since: string | null): Promise<ConsultationMessage[]> {
  await requireUser();
  if (!UUID.test(appointmentId)) return [];
  const supabase = await createClient();
  let q = supabase.from("consultation_messages").select("*").eq("appointment_id", appointmentId).order("created_at");
  if (since) q = q.gt("created_at", since);
  const { data } = await q.limit(200);
  return data ?? [];
}

export async function saveNotes(appointmentId: string, notes: string): Promise<Result<string>> {
  await requireUser();
  if (!UUID.test(appointmentId)) return { ok: false, error: "Invalid consultation." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_consultation_notes", { p_appointment: appointmentId, p_notes: notes.slice(0, 10000) });
  if (error || !data) return { ok: false, error: error?.code === "22023" ? error.message : "Notes couldn't be saved." };
  return { ok: true, data };
}

export async function endConsultation(appointmentId: string): Promise<Result<null>> {
  await requireUser();
  if (!UUID.test(appointmentId)) return { ok: false, error: "Invalid consultation." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_consultation", { p_appointment: appointmentId });
  if (error) return { ok: false, error: "Could not end the consultation. Please try again." };
  revalidatePath("/doctor", "layout");
  revalidatePath("/patient", "layout");
  return { ok: true, data: null };
}
