import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit/log";
import { getCurrentUser } from "@/lib/auth/guards";
import { MEDICAL_FILES_BUCKET } from "@/lib/patient/constants";
import { createClient } from "@/lib/supabase/server";

/** Signed links are short-lived so a leaked URL stops working quickly. */
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Opens a medical report for its patient or for a doctor that patient has
 * booked (RLS on medical_files + storage decides).
 * GET /medical-files/:id             -> open in the browser
 * GET /medical-files/:id?download=1  -> download
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/medical-files/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || (user.role !== "patient" && user.role !== "doctor")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { data: file } = await supabase
    .from("medical_files")
    .select("storage_path, file_name, patient_id, title")
    .eq("id", id)
    .maybeSingle();
  if (!file) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  await audit({
    category: "medical",
    action: download ? "medical_file.download" : "medical_file.view",
    targetType: "medical_file",
    targetId: id,
    patientId: file.patient_id,
    metadata: { title: file.title },
    skipSelf: true,
  });
  const { data, error } = await supabase.storage
    .from(MEDICAL_FILES_BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS, { download: download ? file.file_name : false });
  if (error || !data) return new NextResponse("File unavailable", { status: 502 });

  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
