import { z } from "zod";
import {
  ALLOWED_FILE_TYPES,
  BLOOD_GROUPS,
  MAX_FILE_BYTES,
  MAX_TAG_LENGTH,
  MAX_TAGS,
} from "@/lib/patient/constants";
import { todayIso } from "@/lib/format";
import type { BloodGroup } from "@/types/database";

/** "" -> null, so optional form fields map cleanly to nullable columns. */
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable());

const pastDate = (label: string) =>
  z.preprocess(
    blankToNull,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, `Enter a valid ${label}`)
      .refine((v) => v >= "1900-01-01", `Enter a valid ${label}`)
      .refine((v) => v <= todayIso(), `${label[0].toUpperCase()}${label.slice(1)} can't be in the future`)
      .nullable(),
  );

const optionalNumber = (label: string, max: number) =>
  z.preprocess(
    blankToNull,
    z.coerce
      .number({ error: `Enter a valid ${label}` })
      .positive(`Enter a valid ${label}`)
      .max(max, `Enter a valid ${label}`)
      .transform((n) => Math.round(n * 10) / 10)
      .nullable(),
  );

/** Trims, drops blanks and case-insensitive duplicates. */
const tagList = (label: string) =>
  z
    .array(z.string())
    .transform((items) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of items) {
        const item = raw.trim().replace(/\s+/g, " ");
        const key = item.toLowerCase();
        if (item && !seen.has(key)) {
          seen.add(key);
          out.push(item);
        }
      }
      return out;
    })
    .pipe(
      z
        .array(z.string().max(MAX_TAG_LENGTH, `Each ${label} must be ${MAX_TAG_LENGTH} characters or fewer`))
        .max(MAX_TAGS, `Add at most ${MAX_TAGS} ${label}s`),
    );

export const healthProfileSchema = z.object({
  dateOfBirth: pastDate("date of birth"),
  sex: z.preprocess(blankToNull, z.enum(["male", "female", "other"]).nullable()),
  weightKg: optionalNumber("weight", 500),
  heightCm: optionalNumber("height", 300),
  bloodGroup: z.preprocess(
    blankToNull,
    z.enum(BLOOD_GROUPS as [BloodGroup, ...BloodGroup[]]).nullable(),
  ),
  allergies: tagList("allergy"),
  chronicConditions: tagList("condition"),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(30)
      .regex(/^\+?[0-9\s()-]{6,30}$/, "Enter a valid phone number")
      .nullable(),
  ),
});

export type HealthProfileInput = z.infer<typeof healthProfileSchema>;

const mimeTypes = Object.keys(ALLOWED_FILE_TYPES) as [string, ...string[]];

export const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(mimeTypes, { error: "Only PDF, JPG and PNG files are allowed" }),
  size: z
    .number()
    .int()
    .positive("The file is empty")
    .max(MAX_FILE_BYTES, "Files must be 10 MB or smaller"),
});

export const medicalFileSchema = z.object({
  storagePath: z.string().min(1),
  fileName: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1, "Give the report a title").max(200),
  category: z.enum(["lab_report", "imaging", "prescription", "discharge_summary", "other"]),
  reportDate: pastDate("report date"),
  notes: optionalText(1000),
});
