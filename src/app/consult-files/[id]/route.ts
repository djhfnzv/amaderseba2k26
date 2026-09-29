import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit/log";
import { getCurrentUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens a file shared during a consultation (participants only, via RLS).
 * GET /consult-files/:messageId[?download=1]
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/consult-files/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: msg } = await supabase
    .from("consultation_messages")
    .select("file_path, file_name, appointment_id")
    .eq("id", id)
    .eq("kind", "file")
    .maybeSingle();
  if (!msg?.file_path) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data: appt } = await supabase.from("appointments").select("patient_id").eq("id", msg.appointment_id).maybeSingle();
  await audit({
    category: "medical",
    action: download ? "consult_file.download" : "consult_file.view",
    targetType: "consultation_file",
    targetId: id,
    patientId: appt?.patient_id ?? null,
    metadata: { file: msg.file_name },
    skipSelf: true,
  });
  const { data, error } = await supabase.storage
    .from("consultation-files")
    .createSignedUrl(msg.file_path, 60, { download: download ? (msg.file_name ?? true) : false });
  if (error || !data) return new NextResponse("File unavailable", { status: 502 });

  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
