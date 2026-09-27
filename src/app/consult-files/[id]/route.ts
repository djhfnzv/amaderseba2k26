import { NextResponse, type NextRequest } from "next/server";
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
    .select("file_path, file_name")
    .eq("id", id)
    .eq("kind", "file")
    .maybeSingle();
  if (!msg?.file_path) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from("consultation-files")
    .createSignedUrl(msg.file_path, 60, { download: download ? (msg.file_name ?? true) : false });
  if (error || !data) return new NextResponse("File unavailable", { status: 502 });

  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
