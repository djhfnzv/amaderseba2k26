import { BACKGROUND_HEADER } from "@/lib/auth/session";

/** GET JSON without counting as user activity (see proxy.ts). Null on failure. */
export async function backgroundFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { [BACKGROUND_HEADER]: "1" }, cache: "no-store" });
    if (res.status === 401) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
