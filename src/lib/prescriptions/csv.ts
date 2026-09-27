import { MEDICINE_FORMS, type MedicineForm } from "@/types/database";

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export type MedicineCsvRow = {
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  form: MedicineForm;
  company: string | null;
  is_controlled: boolean;
};

const FORM_ALIASES: Record<string, MedicineForm> = {
  tab: "tablet", tablets: "tablet", cap: "capsule", capsules: "capsule", syr: "syrup", susp: "suspension",
  inj: "injection", oint: "ointment", supp: "suppository", "eye drops": "eye_drops", "ear drops": "ear_drops",
  "nasal spray": "nasal_spray", "oral solution": "solution", soln: "solution", powder: "sachet",
};

function toForm(v: string): MedicineForm | null {
  const k = v.trim().toLowerCase().replace(/\.$/, "");
  if ((MEDICINE_FORMS as readonly string[]).includes(k.replace(/ /g, "_"))) return k.replace(/ /g, "_") as MedicineForm;
  return FORM_ALIASES[k] ?? null;
}

/**
 * Header row required. Columns (any order): generic_name, form, and optional
 * brand_name, strength, company, is_controlled (yes/true/1).
 */
export function readMedicineCsv(text: string, maxRows = 5000): { rows: MedicineCsvRow[]; errors: string[] } {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length < 2) return { rows: [], errors: ["The file needs a header row and at least one medicine."] };
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const col = (name: string) => header.indexOf(name);
  const gi = col("generic_name") >= 0 ? col("generic_name") : col("generic");
  const fi = col("form");
  if (gi < 0 || fi < 0) return { rows: [], errors: ["Columns “generic_name” and “form” are required."] };
  const bi = col("brand_name") >= 0 ? col("brand_name") : col("brand");
  const si = col("strength");
  const ci = col("company") >= 0 ? col("company") : col("manufacturer");
  const ki = col("is_controlled") >= 0 ? col("is_controlled") : col("controlled");

  const rows: MedicineCsvRow[] = [];
  const body = table.slice(1);
  if (body.length > maxRows) errors.push(`Only the first ${maxRows} rows were read.`);
  body.slice(0, maxRows).forEach((r, idx) => {
    const line = idx + 2;
    const cell = (i: number, max: number) => (i >= 0 ? (r[i] ?? "").trim().slice(0, max) : "");
    const generic = cell(gi, 200);
    const form = toForm(cell(fi, 40));
    if (generic.length < 2) return void errors.push(`Row ${line}: missing generic name.`);
    if (!form) return void errors.push(`Row ${line}: unknown form “${cell(fi, 40)}”.`);
    rows.push({
      generic_name: generic,
      brand_name: cell(bi, 120) || null,
      strength: cell(si, 60) || null,
      form,
      company: cell(ci, 120) || null,
      is_controlled: /^(y|yes|true|1)$/i.test(cell(ki, 10)),
    });
  });
  return { rows, errors };
}

export function medicineKey(m: { generic_name: string; brand_name: string | null; strength: string | null; form: string }) {
  return [m.generic_name, m.brand_name ?? "", m.strength ?? "", m.form].map((v) => v.toLowerCase()).join("|");
}
