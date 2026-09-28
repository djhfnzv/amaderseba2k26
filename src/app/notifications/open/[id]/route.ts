import { NextResponse, type NextRequest } from "next/server";
import { ROLE_HOME } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marks a notification read and goes to what it's about. GET /notifications/open/:id */
export async function GET(request: NextRequest, ctx: RouteContext<"/notifications/open/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=/notifications/open/${id}`, request.url));
  const fallback = `${ROLE_HOME[user.role]}/notifications`;
  if (!UUID.test(id)) return NextResponse.redirect(new URL(fallback, request.url));

  const supabase = await createClient();
  const [{ data }] = await Promise.all([
    supabase.from("notifications").select("link").eq("id", id).maybeSingle(),
    supabase.rpc("mark_notifications_read", { p_ids: [id] }),
  ]);
  const link = data?.link && data.link.startsWith("/") && !data.link.startsWith("//") ? data.link : fallback;
  return NextResponse.redirect(new URL(link, request.url));
}
