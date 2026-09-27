import { z } from "zod";
import {
  MAX_LANGUAGES,
  MAX_PHOTO_BYTES,
  MAX_SPECIALTIES,
  PHOTO_TYPES,
  SECTIONS,
  type SectionKey,
} from "@/lib/doctor/constants";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `Must be ${max} characters or fewer`).nullable());

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `Enter ${label}`).max(max, `Must be ${max} characters or fewer`);

const year = (label: string) =>
  z.coerce
    .number({ error: `Enter a valid ${label}` })
    .int(`Enter a valid ${label}`)
    .min(1950, `Enter a valid ${label}`)
    .max(new Date().getFullYear(), `${label[0].toUpperCase()}${label.slice(1)} can't be in the future`);

const optionalYear = (label: string) => z.preprocess(blankToNull, year(label).nullable());

const fee = (label: string) =>
  z.preprocess(
    blankToNull,
    z.coerce
      .number({ error: `Enter a valid ${label}` })
      .min(0, `Enter a valid ${label}`)
      .max(1_000_000, `Enter a valid ${label}`)
      .transform((n) => Math.round(n * 100) / 100)
      .nullable(),
  );

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Dr. Nadia Rahman" -> "dr-nadia-rahman" */
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
  const name = base.replace(/^dr(-|$)/, "");
  return `dr-${name || "doctor"}`;
}

export const basicInfoSchema = z
  .object({
    displayName: requiredText("your name", 120).refine((v) => v.length >= 2, "Enter your name"),
    headline: optionalText(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "Use at least 3 characters")
      .max(80, "Use at most 80 characters")
      .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens only"),
    bio: optionalText(3000),
    licenseNumber: optionalText(50),
    practiceSinceYear: optionalYear("year"),
    languages: z
      .array(z.string().trim().min(1).max(40))
      .max(MAX_LANGUAGES, `Add at most ${MAX_LANGUAGES} languages`),
    specialtyIds: z
      .array(z.coerce.number().int().positive())
      .min(1, "Choose at least one specialty")
      .max(MAX_SPECIALTIES, `Choose at most ${MAX_SPECIALTIES} specialties`),
    offersOnline: z.boolean(),
    offersInPerson: z.boolean(),
    feeOnline: fee("online fee"),
    feeInPerson: fee("in-person fee"),
  })
  .superRefine((v, ctx) => {
    if (v.offersOnline && v.feeOnline == null) {
      ctx.addIssue({ code: "custom", path: ["feeOnline"], message: "Enter your online consultation fee" });
    }
    if (v.offersInPerson && v.feeInPerson == null) {
      ctx.addIssue({ code: "custom", path: ["feeInPerson"], message: "Enter your in-person consultation fee" });
    }
  });

export type BasicInfoInput = z.infer<typeof basicInfoSchema>;

// -----------------------------------------------------------------------------
// Section items — schema built from the shared field config.
// -----------------------------------------------------------------------------
function sectionSchema(key: SectionKey): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {};
  for (const f of SECTIONS[key].fields) {
    const label = f.label.toLowerCase().replace(/ \(.*\)$/, "");
    if (f.type === "year") {
      shape[f.name] = f.required ? year(label) : optionalYear(label);
    } else if (f.type === "url") {
      shape[f.name] = z.preprocess(
        blankToNull,
        z
          .string()
          .trim()
          .max(f.maxLength ?? 500)
          .regex(/^https?:\/\/\S+$/i, "Enter a full link starting with https://")
          .nullable(),
      );
    } else if (f.required) {
      shape[f.name] = requiredText(label, f.maxLength ?? 200);
    } else {
      shape[f.name] = optionalText(f.maxLength ?? 200);
    }
  }
  const schema = z.object(shape);
  if (key === "experience") {
    return schema.refine(
      (v) => v.end_year == null || (v.end_year as number) >= (v.start_year as number),
      { path: ["end_year"], message: "Must be the same as or after the start year" },
    );
  }
  return schema;
}

export const sectionSchemas: Record<SectionKey, z.ZodType<Record<string, unknown>>> = {
  education: sectionSchema("education"),
  experience: sectionSchema("experience"),
  chambers: sectionSchema("chambers"),
  publications: sectionSchema("publications"),
  awards: sectionSchema("awards"),
};

export const photoUploadSchema = z.object({
  mimeType: z.enum(Object.keys(PHOTO_TYPES) as [string, ...string[]], {
    error: "Use a JPG, PNG or WebP image",
  }),
  size: z.number().int().positive("The file is empty").max(MAX_PHOTO_BYTES, "Photos must be 2 MB or smaller"),
});
