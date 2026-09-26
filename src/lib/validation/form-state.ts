import type { z } from "zod";

export type FormState =
  | {
      error?: string;
      message?: string;
      fieldErrors?: Record<string, string[] | undefined>;
      /** Non-secret values echoed back so the form keeps them after a failed submit. */
      values?: Record<string, string>;
    }
  | undefined;

export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

const SECRET_KEYS = new Set(["password", "confirmPassword"]);

/** FormData -> plain object of string values (framework fields dropped). */
export function formToObject(formData: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !key.startsWith("$ACTION")) obj[key] = value;
  });
  return obj;
}

export function publicValues(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !SECRET_KEYS.has(k)));
}
