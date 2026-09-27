import { z } from "zod";
import { MAX_ITEMS, MAX_TESTS } from "@/lib/prescriptions/constants";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => v || null)
    .nullable()
    .default(null);

export const itemSchema = z.object({
  medicine_id: z.uuid().nullable().default(null),
  medicine_name: z.string().trim().min(1, "Enter the medicine name.").max(200),
  generic_name: text(200),
  strength: text(60),
  form: text(30),
  dose: text(60),
  timing: z.enum(["before_meal", "after_meal", "with_meal", "empty_stomach", "bedtime", "any"]).nullable().default(null),
  duration: text(60),
  instructions: text(300),
  is_controlled: z.boolean().default(false),
});

export const testSchema = z.object({
  name: z.string().trim().min(1).max(150),
  note: text(200),
});

/** Everything the editor saves (also the shape stored in templates). */
export const draftSchema = z.object({
  patient_name: z.string().trim().max(120).default(""),
  patient_age: text(20),
  patient_sex: z.enum(["male", "female", "other"]).nullable().default(null),
  patient_weight: text(20),
  patient_phone: text(30),
  chief_complaint: text(2000),
  findings: text(2000),
  diagnosis: text(1000),
  advice: text(3000),
  follow_up_date: z.iso.date().nullable().default(null),
  follow_up_note: text(300),
  items: z.array(itemSchema).max(MAX_ITEMS, `Up to ${MAX_ITEMS} medicines.`).default([]),
  tests: z.array(testSchema).max(MAX_TESTS, `Up to ${MAX_TESTS} tests.`).default([]),
});

export type DraftInput = z.input<typeof draftSchema>;
export type Draft = z.output<typeof draftSchema>;
export type DraftItem = z.output<typeof itemSchema>;

/** Clinical part only — what templates and "copy last" carry over. */
export const templateSchema = draftSchema.pick({
  chief_complaint: true,
  findings: true,
  diagnosis: true,
  advice: true,
  follow_up_note: true,
  items: true,
  tests: true,
});
export type TemplatePayload = z.output<typeof templateSchema>;
