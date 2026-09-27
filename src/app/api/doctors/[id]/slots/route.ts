import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/doctors/:id/slots?type=online|in_person&from=YYYY-MM-DD&days=7
 * Free slots (JSON) for the booking widget. Visibility follows
 * get_available_slots(): public doctors only (or the doctor themself).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/doctors/[id]/slots">) {
  const { id } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  const type = sp.get("type");
  const from = sp.get("from");
  const days = Number(sp.get("days") ?? "7");

  if (!UUID.test(id) || (type !== "online" && type !== "in_person")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  // Signed-in session if any, so a patient's own hold doesn't hide their slot.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_doctor: id,
    p_from: from,
    p_days: Number.isInteger(days) ? Math.min(Math.max(days, 1), 14) : 7,
    p_type: type,
  });
  if (error) {
    console.error("[slots api]", error.message);
    return NextResponse.json({ error: "Could not load slots" }, { status: 500 });
  }

  return NextResponse.json({ slots: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
