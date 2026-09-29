import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/roles";
import { markSessionActive } from "@/lib/auth/session-server";

/**
 * Landing point for links in Supabase emails (e.g. password reset).
 *   - token_hash + type -> verifyOtp
 *   - code (PKCE flow)  -> exchangeCodeForSession
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(
    searchParams.get("next"),
    type === "recovery" ? "/reset-password" : "/dashboard",
  );

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  const url = request.nextUrl.clone();
  url.search = "";
  if (ok) {
    await markSessionActive();
    url.pathname = next;
  } else {
    url.pathname = "/login";
    url.searchParams.set("error", "link_invalid");
  }
  return NextResponse.redirect(url);
}
