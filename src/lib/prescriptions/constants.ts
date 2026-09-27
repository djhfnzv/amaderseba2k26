import type { MedicineForm, MedicineTiming, Sex } from "@/types/database";

// Client-safe constants and helpers for the prescription editor, views and PDF.

export const DOSE_PRESETS = ["1+0+1", "1+1+1", "0+0+1", "1+0+0", "0+1+0", "1+1+1+1", "½+0+½", "As needed"];

export const DURATION_PRESETS = ["3 days", "5 days", "7 days", "10 days", "14 days", "1 month", "3 months", "Continue"];

export const TIMING_OPTIONS: { value: MedicineTiming; label: string }[] = [
  { value: "after_meal", label: "After meal" },
  { value: "before_meal", label: "Before meal" },
  { value: "with_meal", label: "With meal" },
  { value: "empty_stomach", label: "Empty stomach" },
  { value: "bedtime", label: "At bedtime" },
  { value: "any", label: "Any time" },
];

export const TIMING_LABEL = Object.fromEntries(TIMING_OPTIONS.map((t) => [t.value, t.label])) as Record<
  MedicineTiming,
  string
>;

export const FORM_LABEL: Record<MedicineForm, string> = {
  tablet: "Tab.",
  capsule: "Cap.",
  syrup: "Syr.",
  suspension: "Susp.",
  drops: "Drops",
  injection: "Inj.",
  cream: "Cream",
  ointment: "Oint.",
  gel: "Gel",
  lotion: "Lotion",
  inhaler: "Inhaler",
  nasal_spray: "Nasal spray",
  eye_drops: "Eye drops",
  ear_drops: "Ear drops",
  suppository: "Supp.",
  sachet: "Sachet",
  solution: "Soln.",
  other: "",
};

export const FORM_OPTIONS = (Object.keys(FORM_LABEL) as MedicineForm[]).map((f) => ({
  value: f,
  label: f === "other" ? "Other" : f.replace("_", " ").replace(/^./, (c) => c.toUpperCase()),
}));

export const COMMON_TESTS = [
  "CBC",
  "ESR",
  "RBS",
  "FBS",
  "2HABF",
  "HbA1c",
  "Lipid profile",
  "S. creatinine",
  "SGPT (ALT)",
  "S. electrolytes",
  "TSH",
  "Urine R/E",
  "Stool R/E",
  "CRP",
  "Dengue NS1",
  "Chest X-ray P/A view",
  "ECG",
  "USG of whole abdomen",
  "Echocardiogram",
];

export const ADVICE_SUGGESTIONS = [
  "Drink plenty of water.",
  "Take adequate rest.",
  "Avoid oily and spicy food.",
  "Reduce salt intake.",
  "Walk 30 minutes daily.",
  "Avoid smoking.",
  "Take medicines on time and complete the course.",
  "Come back or seek care if symptoms get worse.",
];

export const PRESCRIPTION_STATUS_LABEL = { draft: "Draft", signed: "Signed", superseded: "Replaced" } as const;

export const SEX_LABEL: Record<Sex, string> = { male: "Male", female: "Female", other: "Other" };

export const MAX_ITEMS = 25;
export const MAX_TESTS = 25;

/** "Tab. Paracetamol 500 mg" style label for a catalogue entry. */
export function medicineLabel(m: { brand_name?: string | null; generic_name: string; strength?: string | null; form?: string | null }) {
  const form = m.form && m.form in FORM_LABEL ? FORM_LABEL[m.form as MedicineForm] : (m.form ?? "");
  return [form, m.brand_name || m.generic_name, m.strength].filter(Boolean).join(" ");
}

// -----------------------------------------------------------------------------
// Allergy check (warning only; the doctor can override)
// -----------------------------------------------------------------------------

/** Allergy words -> medicine name fragments that belong to that group. */
const ALLERGY_GROUPS: { match: RegExp; drugs: string[] }[] = [
  { match: /penicillin|amoxi|ampicillin/, drugs: ["amoxicillin", "ampicillin", "flucloxacillin", "penicillin", "cloxacillin"] },
  { match: /sulfa|sulpha|sulphonamide|sulfonamide/, drugs: ["sulfamethoxazole", "sulfasalazine", "sulfadiazine"] },
  { match: /cephalo|cef|ceph/, drugs: ["cef", "ceph"] },
  {
    match: /nsaid|aspirin|ibuprofen/,
    drugs: ["aspirin", "ibuprofen", "diclofenac", "naproxen", "aceclofenac", "etoricoxib", "celecoxib", "ketorolac", "mefenamic"],
  },
  { match: /codeine|opioid|morphine/, drugs: ["codeine", "morphine", "tramadol", "pethidine", "tapentadol", "fentanyl"] },
  { match: /macrolide|erythromycin|azithro/, drugs: ["azithromycin", "clarithromycin", "erythromycin"] },
  { match: /quinolone|cipro|levoflox/, drugs: ["ciprofloxacin", "levofloxacin", "moxifloxacin", "ofloxacin"] },
];

export type AllergyWarning = { medicine: string; allergy: string };

/** Which medicines on the list may clash with the patient's recorded allergies. */
export function allergyWarnings(
  allergies: string[],
  items: { medicine_name: string; generic_name?: string | null }[],
): AllergyWarning[] {
  const out: AllergyWarning[] = [];
  for (const item of items) {
    const name = `${item.medicine_name} ${item.generic_name ?? ""}`.toLowerCase();
    for (const allergy of allergies) {
      const a = allergy.toLowerCase().trim();
      if (a.length < 3) continue;
      const direct = a.split(/[^a-z]+/).some((w) => w.length >= 4 && name.includes(w));
      const group = ALLERGY_GROUPS.some((g) => g.match.test(a) && g.drugs.some((d) => name.includes(d)));
      if (direct || group) {
        out.push({ medicine: item.medicine_name, allergy });
        break;
      }
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Consultation notes -> prescription fields
// -----------------------------------------------------------------------------

/**
 * Splits notes written with the room's "Chief complaint: / Findings: /
 * Assessment: / Plan:" headings. Notes without headings go to findings.
 */
export function notesToFields(notes: string | null): {
  chief_complaint: string | null;
  findings: string | null;
  diagnosis: string | null;
  advice: string | null;
} {
  const empty = { chief_complaint: null, findings: null, diagnosis: null, advice: null };
  if (!notes?.trim()) return empty;
  const heads: [RegExp, keyof typeof empty][] = [
    [/^(chief\s+)?complaints?\s*:/i, "chief_complaint"],
    [/^(findings?|examination|o\/e)\s*:/i, "findings"],
    [/^(assessment|diagnosis|dx)\s*:/i, "diagnosis"],
    [/^(plan|advice)\s*:/i, "advice"],
  ];
  const out: Record<keyof typeof empty, string[]> = { chief_complaint: [], findings: [], diagnosis: [], advice: [] };
  let current: keyof typeof empty | null = null;
  let matched = false;
  for (const line of notes.split(/\r?\n/)) {
    const head = heads.find(([re]) => re.test(line.trim()));
    if (head) {
      current = head[1];
      matched = true;
      const rest = line.trim().replace(head[0], "").trim();
      if (rest) out[current].push(rest);
    } else if (current) {
      out[current].push(line);
    }
  }
  if (!matched) return { ...empty, findings: notes.trim().slice(0, 2000) };
  const join = (k: keyof typeof empty) => out[k].join("\n").trim().slice(0, k === "diagnosis" ? 1000 : 2000) || null;
  return { chief_complaint: join("chief_complaint"), findings: join("findings"), diagnosis: join("diagnosis"), advice: join("advice") };
}
