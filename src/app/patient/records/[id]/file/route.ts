import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { MEDICAL_FILES_BUCKET } from "@/lib/patient/constants";
import { createClient } from "@/lib/supabase/server";

/** Signed links are short-lived so a leaked URL stops working quickly. */
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * GET /patient/records/:id/file            -> open in the browser
 * GET /patient/records/:id/file?download=1 -> download with the original name
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/patient/records/[id]/file">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.role !== "patient" || user.status !== "active") {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  // RLS limits this to the patient's own files.
  const { data: file } = await supabase
    .from("medical_files")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (!file) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from(MEDICAL_FILES_BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: download ? file.file_name : false,
    });
  if (error || !data) return new NextResponse("File unavailable", { status: 502 });

  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
