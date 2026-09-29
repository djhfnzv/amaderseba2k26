"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { refundForComplaint } from "@/lib/payments/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsOf, formToObject, publicValues, type FormState } from "@/lib/validation/form-state";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function friendly(error: { code?: string; message: string }, context: string): string {
  if (["22023", "P0002", "42501"].includes(error.code ?? "")) return error.message;
  console.error(`[${context}]`, error);
  return "Something went wrong. Please try again.";
}

function revalidateComplaints(id?: string) {
  revalidatePath("/admin/complaints");
  revalidatePath("/patient/complaints");
  revalidatePath("/doctor/complaints");
  if (id) {
    revalidatePath(`/admin/complaints/${id}`);
    revalidatePath(`/patient/complaints/${id}`);
    revalidatePath(`/doctor/complaints/${id}`);
  }
}

const fileSchema = z.object({
  category: z.enum(
    ["appointment", "payment", "doctor_conduct", "patient_conduct", "prescription", "video_call", "privacy", "technical", "other"],
    "Choose what it's about.",
  ),
  appointmentId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  subject: z.string().trim().min(5, "Add a short subject (at least 5 characters).").max(120),
  description: z.string().trim().min(10, "Describe what happened (at least 10 characters).").max(3000),
});

export async function fileComplaint(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role !== "patient" && user.role !== "doctor") return { error: "Only patients and doctors can file complaints." };
  const raw = formToObject(formData);
  const parsed = fileSchema.safeParse({ appointmentId: "", ...raw });
  if (!parsed.success) {
    return { error: "Please check the form.", fieldErrors: fieldErrorsOf(parsed.error), values: publicValues(raw) };
  }
  const { category, appointmentId, subject, description } = parsed.data;
  const limit = await rateLimit("complaint_file", user.id);
  if (!limit.ok) return { error: `You've filed several complaints just now. Please try again in ${limit.retryAfter}.`, values: publicValues(raw) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("file_complaint", {
    p_category: category,
    p_subject: subject,
    p_description: description,
    p_appointment: appointmentId,
  });
  if (error || !data) {
    return { error: error ? friendly(error, "fileComplaint") : "Could not file the complaint.", values: publicValues(raw) };
  }
  revalidateComplaints();
  redirect(`/${user.role}/complaints/${data}?filed=1`);
}

export async function replyComplaint(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(formData.get("complaintId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const internal = user.role === "admin" && formData.get("internal") === "on";
  if (!UUID.test(id)) return { error: "Complaint not found." };
  if (!body) return { error: "Write a message first." };
  if (body.length > 3000) return { error: "Keep it under 3000 characters." };
  if (user.role !== "admin") {
    const limit = await rateLimit("complaint_reply", user.id);
    if (!limit.ok) return { error: `Too many messages. Please try again in ${limit.retryAfter}.`, values: { body } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_complaint", { p_complaint: id, p_body: body, p_internal: internal });
  if (error) return { error: friendly(error, "replyComplaint"), values: { body } };
  revalidateComplaints(id);
  return { message: internal ? "Internal note added." : "Message sent." };
}

const updateSchema = z.object({
  complaintId: z.uuid(),
  status: z.enum(["open", "in_review", "resolved", "rejected"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  resolution: z.string().trim().max(2000).default(""),
});

export async function updateComplaint(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const raw = formToObject(formData);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the form.", values: publicValues(raw) };
  const { complaintId, status, priority, resolution } = parsed.data;
  if ((status === "resolved" || status === "rejected") && resolution.length < 5) {
    return {
      error: "Explain the outcome — the complainant will see it.",
      fieldErrors: { resolution: ["Write at least a sentence."] },
      values: publicValues(raw),
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_complaint", {
    p_complaint: complaintId,
    p_status: status,
    p_priority: priority,
    p_resolution: resolution || null,
  });
  if (error) return { error: friendly(error, "updateComplaint"), values: publicValues(raw) };
  revalidateComplaints(complaintId);
  return { message: "Saved." };
}

export async function refundComplaint(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("admin");
  const id = String(formData.get("complaintId") ?? "");
  const amount = Number(String(formData.get("amount") ?? "").replace(/,/g, ""));
  if (!UUID.test(id)) return { error: "Complaint not found." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount above zero." };

  const res = await refundForComplaint(id, Math.round(amount * 100) / 100, admin.id);
  revalidateComplaints(id);
  revalidatePath("/admin/payments");
  if (!res.ok) return { error: res.error };
  return {
    message: res.sent
      ? "Refund sent to the payment gateway."
      : "Refund recorded, but the gateway didn't accept it yet — retry it from Payments.",
  };
}
