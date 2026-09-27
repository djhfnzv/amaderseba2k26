"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { medicineKey, readMedicineCsv } from "@/lib/prescriptions/csv";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsOf, formToObject, publicValues, type FormState } from "@/lib/validation/form-state";
import { MEDICINE_FORMS } from "@/types/database";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CSV_BYTES = 2 * 1024 * 1024;

const medicineSchema = z.object({
  generic_name: z.string().trim().min(2, "Enter the generic name.").max(200),
  brand_name: z.string().trim().max(120).transform((v) => v || null),
  strength: z.string().trim().max(60).transform((v) => v || null),
  form: z.enum(MEDICINE_FORMS, "Choose a form."),
  company: z.string().trim().max(120).transform((v) => v || null),
  is_controlled: z.literal("on").optional().transform((v) => v === "on"),
});

export async function addMedicine(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const values = formToObject(formData);
  const parsed = medicineSchema.safeParse({ brand_name: "", strength: "", company: "", ...values });
  if (!parsed.success) {
    return { error: "Please check the medicine.", fieldErrors: fieldErrorsOf(parsed.error), values: publicValues(values) };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("medicines").insert(parsed.data);
  if (error) {
    if (error.code === "23505") return { error: "That medicine is already in the list.", values: publicValues(values) };
    console.error("[addMedicine]", error.message);
    return { error: "Could not add the medicine.", values: publicValues(values) };
  }
  revalidatePath("/admin/medicines");
  return { message: `Added ${parsed.data.brand_name ?? parsed.data.generic_name}.` };
}

/** Toggle active / controlled flags. */
export async function updateMedicineFlag(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const flag = String(formData.get("flag") ?? "");
  const value = formData.get("value") === "true";
  if (!UUID.test(id) || (flag !== "is_active" && flag !== "is_controlled")) return;
  const supabase = await createClient();
  const { error } = await supabase.from("medicines").update(flag === "is_active" ? { is_active: value } : { is_controlled: value }).eq("id", id);
  if (error) console.error("[updateMedicineFlag]", error.message);
  revalidatePath("/admin/medicines");
}

export async function importMedicines(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > MAX_CSV_BYTES) return { error: "The file must be 2 MB or smaller." };
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return { error: "Upload a .csv file." };

  const { rows, errors } = readMedicineCsv(await file.text());
  if (!rows.length) return { error: errors[0] ?? "No medicines found in the file." };

  const supabase = await createClient();
  // Skip rows already in the catalogue (the unique index would reject the batch).
  const { data: existing, error: readError } = await supabase
    .from("medicines")
    .select("generic_name, brand_name, strength, form")
    .eq("is_custom", false)
    .limit(50000);
  if (readError) {
    console.error("[importMedicines]", readError.message);
    return { error: "Could not read the current list." };
  }
  const seen = new Set((existing ?? []).map(medicineKey));
  const fresh = rows.filter((r) => {
    const k = medicineKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  let added = 0;
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500);
    const { error } = await supabase.from("medicines").insert(chunk);
    if (error) {
      console.error("[importMedicines]", error.message);
      return { error: `Stopped after ${added} medicines: ${error.code === "23514" ? "a value is too long or invalid" : "database error"}.` };
    }
    added += chunk.length;
  }

  revalidatePath("/admin/medicines");
  const skipped = rows.length - fresh.length;
  const notes = [skipped ? `${skipped} already listed` : null, errors.length ? `${errors.length} rows had problems` : null]
    .filter(Boolean)
    .join(", ");
  return {
    message: `Imported ${added} medicine${added === 1 ? "" : "s"}${notes ? ` (${notes})` : ""}.`,
    error: errors.length ? errors.slice(0, 5).join(" ") + (errors.length > 5 ? " …" : "") : undefined,
  };
}
