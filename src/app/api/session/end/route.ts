import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit/log";
import { clearSessionActivity } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";

/** Signs out after the idle countdown runs out (POST so other sites can't trigger it). */
export async function POST(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason") === "offline" ? "offline" : "idle";
  await audit({ category: "security", action: "logout", targetType: "user", metadata: { reason } });
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  await clearSessionActivity();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
