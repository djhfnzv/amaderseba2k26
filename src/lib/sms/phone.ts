// Client-safe helpers for Bangladeshi mobile numbers.

/** Accepts 01XXXXXXXXX, +8801XXXXXXXXX, 8801XXXXXXXXX (spaces/dashes ok) -> 8801XXXXXXXXX. */
export function normalizeBdPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  const local = digits.startsWith("880") ? digits.slice(2) : digits.startsWith("80") ? digits.slice(1) : digits;
  return /^01[3-9]\d{8}$/.test(local) ? `88${local}` : null;
}

/** 8801712345678 -> "01712-345678". */
export function formatBdPhone(e164: string): string {
  const local = e164.replace(/^88/, "");
  return `${local.slice(0, 5)}-${local.slice(5)}`;
}

/** 8801712345678 -> "01712-•••678" for logs and admin lists. */
export function maskBdPhone(e164: string): string {
  const local = e164.replace(/^88/, "");
  return `${local.slice(0, 5)}-•••${local.slice(-3)}`;
}
