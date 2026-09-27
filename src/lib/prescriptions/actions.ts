"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { allergyWarnings, notesToFields, type AllergyWarning } from "@/lib/prescriptions/constants";
import { getPatientSnapshot } from "@/lib/prescriptions/queries";
import { draftSchema, templateSchema, type DraftInput } from "@/lib/prescriptions/schema";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsOf, formToObject, publicValues, type FormState } from "@/lib/validation/form-state";
import type { Database, Medicine, MedicineForm, PrescriptionTemplate } from "@/types/database";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** DB functions raise readable messages for expected problems; hide the rest. */
function friendly(error: { code?: string; message: string }, context: string): string {
  if (error.code === "22023" || error.code === "P0002" || error.code === "42501") return error.message;
  console.error(`[${context}]`, error);
  return "Something went wrong. Please try again.";
}

function revalidateRx() {
  revalidatePath("/doctor", "layout");
  revalidatePath("/patient", "layout");
  revalidatePath("/admin/prescriptions");
}

// -----------------------------------------------------------------------------
// Create a draft: from an appointment, one of the doctor's patients, or typed in
// -----------------------------------------------------------------------------
const manualSchema = z.object({
  patient_name: z.string().trim().min(2, "Enter the patient's name.").max(120),
  patient_age: z.string().trim().max(20).transform((v) => v || null),
  patient_sex: z.enum(["male", "female", "other", ""]).transform((v) => v || null),
  patient_phone: z.string().trim().max(30).transform((v) => v || null),
  patient_weight: z.string().trim().max(20).transform((v) => v || null),
});

export async function createPrescription(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("doctor", "/doctor/prescriptions");
  const supabase = await createClient();
  const mode = String(formData.get("mode") ?? "");
  const appointmentId = String(formData.get("appointmentId") ?? "");
  let patientId = String(formData.get("patientId") ?? "");

  let insert: Database["public"]["Tables"]["prescriptions"]["Insert"] = { doctor_id: user.id };

  if (appointmentId) {
    if (!UUID.test(appointmentId)) return { error: "Invalid appointment." };
    const { data: appt } = await supabase
      .from("appointments")
      .select("id, patient_id, doctor_id")
      .eq("id", appointmentId)
      .maybeSingle();
    if (!appt || appt.doctor_id !== user.id) return { error: "Appointment not found." };

    // Continue an open draft for this visit instead of starting another.
    const { data: open } = await supabase
      .from("prescriptions")
      .select("id")
      .eq("appointment_id", appointmentId)
      .eq("status", "draft")
      .limit(1)
      .maybeSingle();
    if (open) redirect(`/doctor/prescriptions/${open.id}`);

    patientId = appt.patient_id;
    const { data: consult } = await supabase.from("consultations").select("notes").eq("appointment_id", appointmentId).maybeSingle();
    insert = { ...insert, appointment_id: appointmentId, ...notesToFields(consult?.notes ?? null) };
  }

  if (mode === "manual" && !appointmentId) {
    const parsed = manualSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        error: "Please check the patient details.",
        fieldErrors: fieldErrorsOf(parsed.error),
        values: publicValues(formToObject(formData)),
      };
    }
    insert = { ...insert, ...parsed.data };
  } else {
    if (!UUID.test(patientId)) return { error: "Choose a patient, or enter the details manually." };
    const snap = await getPatientSnapshot(patientId);
    if (!snap) return { error: "Patient not found." };
    insert = {
      ...insert,
      patient_id: patientId,
      patient_name: snap.patient_name,
      patient_age: snap.patient_age,
      patient_sex: snap.patient_sex,
      patient_weight: snap.patient_weight,
      patient_phone: snap.patient_phone,
    };
  }

  const { data, error } = await supabase.from("prescriptions").insert(insert).select("id").single();
  if (error || !data) return { error: error ? friendly(error, "createPrescription") : "Could not start the prescription." };
  revalidateRx();
  redirect(`/doctor/prescriptions/${data.id}`);
}

// -----------------------------------------------------------------------------
// Edit / sign / amend
// -----------------------------------------------------------------------------
async function writeDraft(id: string, input: DraftInput): Promise<Result<null>> {
  if (!UUID.test(id)) return { ok: false, error: "Invalid prescription." };
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { items, tests, ...fields } = parsed.data;

  const supabase = await createClient();
  const { data: row, error } = await supabase.from("prescriptions").update(fields).eq("id", id).eq("status", "draft").select("id").maybeSingle();
  if (error) return { ok: false, error: friendly(error, "saveDraft") };
  if (!row) return { ok: false, error: "This prescription is already signed and can't be edited." };

  const [delItems, delTests] = await Promise.all([
    supabase.from("prescription_items").delete().eq("prescription_id", id),
    supabase.from("prescription_tests").delete().eq("prescription_id", id),
  ]);
  if (delItems.error || delTests.error) return { ok: false, error: friendly((delItems.error ?? delTests.error)!, "saveDraft") };

  const [insItems, insTests] = await Promise.all([
    items.length
      ? supabase.from("prescription_items").insert(items.map((it, i) => ({ ...it, prescription_id: id, sort_order: i })))
      : Promise.resolve({ error: null }),
    tests.length
      ? supabase.from("prescription_tests").insert(tests.map((t, i) => ({ ...t, prescription_id: id, sort_order: i })))
      : Promise.resolve({ error: null }),
  ]);
  if (insItems.error || insTests.error) return { ok: false, error: friendly((insItems.error ?? insTests.error)!, "saveDraft") };
  return { ok: true, data: null };
}

export async function saveDraft(id: string, input: DraftInput): Promise<Result<string>> {
  await requireRole("doctor");
  const res = await writeDraft(id, input);
  if (!res.ok) return res;
  revalidatePath(`/doctor/prescriptions/${id}`);
  return { ok: true, data: new Date().toISOString() };
}

export async function signPrescription(
  id: string,
  input: DraftInput,
  acknowledgedAllergies: boolean,
): Promise<{ ok: true; data: string } | { ok: false; error: string; warnings?: AllergyWarning[] }> {
  await requireRole("doctor");
  const saved = await writeDraft(id, input);
  if (!saved.ok) return saved;

  const supabase = await createClient();
  const { data: rx } = await supabase.from("prescriptions").select("patient_id").eq("id", id).maybeSingle();
  if (rx?.patient_id && !acknowledgedAllergies) {
    const snap = await getPatientSnapshot(rx.patient_id);
    const parsed = draftSchema.parse(input);
    const warnings = allergyWarnings(snap?.allergies ?? [], parsed.items);
    if (warnings.length) {
      return { ok: false, error: "Some medicines may clash with the patient's allergies.", warnings };
    }
  }

  const { data: code, error } = await supabase.rpc("sign_prescription", { p_id: id });
  if (error || !code) return { ok: false, error: error ? friendly(error, "signPrescription") : "Could not sign." };
  revalidateRx();
  return { ok: true, data: code };
}

export async function amendPrescription(formData: FormData): Promise<void> {
  await requireRole("doctor");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("amend_prescription", { p_id: id });
  if (error || !data) {
    if (error) console.error("[amendPrescription]", error.message);
    redirect(`/doctor/prescriptions/${id}?error=amend`);
  }
  revalidateRx();
  redirect(`/doctor/prescriptions/${data}`);
}

export async function deleteDraft(formData: FormData): Promise<void> {
  await requireRole("doctor");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("prescriptions").select("parent_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("prescriptions").delete().eq("id", id).eq("status", "draft");
  if (error) console.error("[deleteDraft]", error.message);
  revalidateRx();
  redirect(data?.parent_id ? `/doctor/prescriptions/${data.parent_id}` : "/doctor/prescriptions");
}

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------
export async function saveTemplate(name: string, payload: unknown): Promise<Result<PrescriptionTemplate>> {
  await requireRole("doctor");
  const title = name.trim().slice(0, 80);
  if (!title) return { ok: false, error: "Give the template a name." };
  const parsed = templateSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Nothing to save." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prescription_templates")
    .insert({ name: title, payload: parsed.data })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error ? friendly(error, "saveTemplate") : "Could not save the template." };
  return { ok: true, data };
}

export async function deleteTemplate(id: string): Promise<Result<null>> {
  await requireRole("doctor");
  if (!UUID.test(id)) return { ok: false, error: "Invalid template." };
  const supabase = await createClient();
  const { error } = await supabase.from("prescription_templates").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error, "deleteTemplate") };
  return { ok: true, data: null };
}

// -----------------------------------------------------------------------------
// Custom medicine (not in the catalogue)
// -----------------------------------------------------------------------------
const customMedicineSchema = z.object({
  generic_name: z.string().trim().min(2, "Enter the medicine name.").max(200),
  brand_name: z.string().trim().max(120).transform((v) => v || null),
  strength: z.string().trim().max(60).transform((v) => v || null),
  form: z.enum([
    "tablet", "capsule", "syrup", "suspension", "drops", "injection", "cream", "ointment", "gel", "lotion", "inhaler",
    "nasal_spray", "eye_drops", "ear_drops", "suppository", "sachet", "solution", "other",
  ] satisfies MedicineForm[]),
});

export async function addCustomMedicine(input: z.input<typeof customMedicineSchema>): Promise<Result<Medicine>> {
  await requireRole("doctor");
  const parsed = customMedicineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the medicine." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("medicines")
    .insert({ ...parsed.data, is_custom: true })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error ? friendly(error, "addCustomMedicine") : "Could not add the medicine." };
  return { ok: true, data };
}

// -----------------------------------------------------------------------------
// Advice notes (without a prescription)
// -----------------------------------------------------------------------------
const adviceSchema = z.object({
  patientId: z.uuid("Invalid patient."),
  appointmentId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  title: z.string().trim().max(120).transform((v) => v || null),
  body: z.string().trim().min(1, "Write your advice first.").max(5000, "Keep it under 5000 characters."),
});

export async function sendAdvice(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("doctor");
  const parsed = adviceSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: "Please check the advice.", fieldErrors: fieldErrorsOf(parsed.error) };
  const { patientId, appointmentId, title, body } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("doctor_advice")
    .insert({ patient_id: patientId, appointment_id: appointmentId, title, body });
  if (error) {
    console.error("[sendAdvice]", error.message);
    return { error: "Could not send the advice. You can only advise your own patients." };
  }
  revalidateRx();
  return { message: "Advice sent to the patient." };
}
