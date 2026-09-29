import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Medicine type-ahead for the prescription editor (doctors only).
 * GET /api/medicines?q=para
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "doctor" || user.status !== "active") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  // Keep only characters that are safe inside a PostgREST or() filter.
  const q = (request.nextUrl.searchParams.get("q") ?? "").replace(/[^\p{L}\p{N} +.\-/]/gu, " ").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ medicines: [] });
  const limit = await rateLimit("medicine_search", user.id);
  if (!limit.ok) return NextResponse.json({ error: "Too many searches", medicines: [] }, { status: 429 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("medicines")
    .select("id, generic_name, brand_name, strength, form, company, is_controlled, is_custom")
    .eq("is_active", true)
    .or(`generic_name.ilike."${q}%",brand_name.ilike."${q}%",generic_name.ilike."% ${q}%"`)
    .order("generic_name")
    .order("strength")
    .limit(15);
  if (error) {
    console.error("[api/medicines]", error.message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
  return NextResponse.json({ medicines: data ?? [] }, { headers: { "Cache-Control": "private, max-age=60" } });
}
