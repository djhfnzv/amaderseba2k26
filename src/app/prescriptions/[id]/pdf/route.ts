import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { renderPrescriptionPdf } from "@/lib/prescriptions/pdf";
import { getPrescription } from "@/lib/prescriptions/queries";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A4 prescription PDF. Doctor (own, drafts shown as previews), patient
 * (signed/replaced) and admin — all decided by RLS.
 * GET /prescriptions/:id/pdf[?download=1]
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/prescriptions/[id]/pdf">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || !UUID.test(id)) return new NextResponse("Not found", { status: 404 });

  const rx = await getPrescription(id);
  if (!rx) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: doc } = await supabase.from("doctor_profiles").select("timezone").eq("user_id", rx.doctor_id).maybeSingle();
  const pdf = await renderPrescriptionPdf(rx, doc?.timezone ?? "Asia/Dhaka");

  const name = `prescription-${rx.verify_code ?? "draft"}${rx.version > 1 ? `-v${rx.version}` : ""}.pdf`;
  const download = request.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
