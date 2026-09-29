"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsOf, formToObject, publicValues, type FormState } from "@/lib/validation/form-state";

function revalidateCatalog() {
  revalidatePath("/admin/catalog");
  revalidatePath("/doctors");
  revalidatePath("/doctor/portfolio");
}

function slugOf(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

const specialtySchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80),
  description: z.string().trim().max(200, "Keep it under 200 characters.").transform((v) => v || null),
});

export async function addSpecialty(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const raw = formToObject(formData);
  const parsed = specialtySchema.safeParse({ description: "", ...raw });
  if (!parsed.success) return { error: "Please check the form.", fieldErrors: fieldErrorsOf(parsed.error), values: publicValues(raw) };
  const slug = slugOf(parsed.data.name);
  if (slug.length < 2) return { error: "Use English letters in the name.", values: publicValues(raw) };

  const supabase = await createClient();
  const { error } = await supabase.from("specialties").insert({ slug, ...parsed.data });
  if (error) {
    if (error.code === "23505") return { error: "A specialty with that name already exists.", values: publicValues(raw) };
    console.error("[addSpecialty]", error.message);
    return { error: "Could not add the specialty.", values: publicValues(raw) };
  }
  revalidateCatalog();
  return { message: `Added ${parsed.data.name}. Doctors can pick it now.` };
}

export async function updateSpecialty(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const raw = formToObject(formData);
  const id = Number(raw.id);
  const parsed = specialtySchema.safeParse({ description: "", ...raw });
  if (!Number.isInteger(id) || id <= 0) return { error: "Specialty not found." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const supabase = await createClient();
  const { error } = await supabase.from("specialties").update(parsed.data).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Another specialty already has that name." };
    console.error("[updateSpecialty]", error.message);
    return { error: "Could not save." };
  }
  revalidateCatalog();
  return { message: "Saved." };
}

export async function setSpecialtyActive(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("specialties").update({ is_active: formData.get("active") === "true" }).eq("id", id);
  if (error) console.error("[setSpecialtyActive]", error.message);
  revalidateCatalog();
}

const testSchema = z.object({
  name: z.string().trim().min(2, "Enter the test name.").max(100),
  category: z.enum(["blood", "urine_stool", "imaging", "cardiac", "other"]),
});

export async function addLabTest(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const raw = formToObject(formData);
  const parsed = testSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the form.", fieldErrors: fieldErrorsOf(parsed.error), values: publicValues(raw) };
  const supabase = await createClient();
  const { error } = await supabase.from("lab_tests").insert(parsed.data);
  if (error) {
    if (error.code === "23505") return { error: "That test is already in the list.", values: publicValues(raw) };
    console.error("[addLabTest]", error.message);
    return { error: "Could not add the test.", values: publicValues(raw) };
  }
  revalidatePath("/admin/catalog");
  return { message: `Added ${parsed.data.name}.` };
}

export async function setLabTestActive(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("lab_tests").update({ is_active: formData.get("active") === "true" }).eq("id", id);
  if (error) console.error("[setLabTestActive]", error.message);
  revalidatePath("/admin/catalog");
}
