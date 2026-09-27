import type { BloodGroup, MedicalFileCategory, Sex } from "@/types/database";

export const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
];

export const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/** Suggestions only — patients can type anything. */
export const COMMON_ALLERGIES = [
  "Penicillin",
  "Amoxicillin",
  "Sulfa drugs",
  "Aspirin",
  "Ibuprofen / NSAIDs",
  "Cephalosporins",
  "Codeine",
  "Latex",
  "Peanuts",
  "Tree nuts",
  "Shellfish",
  "Fish",
  "Eggs",
  "Milk",
  "Dust mites",
  "Pollen",
];

export const COMMON_CONDITIONS = [
  "Type 1 diabetes",
  "Type 2 diabetes",
  "Hypertension",
  "Asthma",
  "COPD",
  "Heart disease",
  "Chronic kidney disease",
  "Hypothyroidism",
  "Hyperthyroidism",
  "Epilepsy",
  "Arthritis",
  "Depression",
  "Anxiety",
  "Hepatitis B",
  "Migraine",
];

export const MAX_TAGS = 30;
export const MAX_TAG_LENGTH = 60;

export const FILE_CATEGORIES: { value: MedicalFileCategory; label: string }[] = [
  { value: "lab_report", label: "Lab report" },
  { value: "imaging", label: "Imaging (X-ray, scan)" },
  { value: "prescription", label: "Prescription" },
  { value: "discharge_summary", label: "Discharge summary" },
  { value: "other", label: "Other" },
];

export const FILE_CATEGORY_LABEL = Object.fromEntries(
  FILE_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<MedicalFileCategory, string>;

export const MEDICAL_FILES_BUCKET = "medical-files";
// Shared document rules (PDF/JPG/PNG, 10 MB) live in lib/files.
export {
  DOCUMENT_TYPES as ALLOWED_FILE_TYPES,
  MAX_DOCUMENT_BYTES as MAX_FILE_BYTES,
  DOCUMENT_ACCEPT as FILE_ACCEPT,
} from "@/lib/files";
