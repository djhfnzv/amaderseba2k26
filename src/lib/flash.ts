import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

/**
 * One-off confirmation pop-up ("Profile saved") for the person who just did
 * something. Server actions call flash(); the dashboard shell reads the
 * cookie, shows the toast with the notification chime, and clears it.
 * Setting a cookie in a server action also re-renders the page, so it shows
 * immediately even when the action doesn't redirect.
 */
export const FLASH_COOKIE = "ml_flash";

export type Flash = { id: string; text: string; kind: "success" | "info" };

export async function flash(text: string, kind: Flash["kind"] = "success"): Promise<void> {
  const value: Flash = { id: randomUUID(), text: text.slice(0, 200), kind };
  (await cookies()).set(FLASH_COOKIE, Buffer.from(JSON.stringify(value)).toString("base64url"), {
    path: "/",
    maxAge: 120,
    sameSite: "lax",
    httpOnly: false, // the browser clears it after showing it
    secure: process.env.NODE_ENV === "production",
  });
}

export async function readFlash(): Promise<Flash | null> {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Flash>;
    if (typeof v.id !== "string" || typeof v.text !== "string") return null;
    return { id: v.id, text: v.text, kind: v.kind === "info" ? "info" : "success" };
  } catch {
    return null;
  }
}
