import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { VERIFICATION_BUCKET } from "@/lib/verification/constants";

/** Signed links are short-lived so a leaked URL stops working quickly. */
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Opens a verification document for its doctor or an admin (RLS decides).
 * GET /verification-documents/:id             -> open in the browser
 * GET /verification-documents/:id?download=1  -> download
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/verification-documents/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || (user.role !== "doctor" && user.role !== "admin")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("verification_documents")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: download ? doc.file_name : false,
    });
  if (error || !data) return new NextResponse("File unavailable", { status: 502 });

  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
