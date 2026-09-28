import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { dispatchSms } from "@/lib/notifications/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Woken every minute by Supabase pg_cron (and usable by Vercel Cron):
 * expires unpaid bookings, queues reminders and sends due SMS.
 * Requires `Authorization: Bearer <CRON_SECRET>`.
 */
async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const [expired, reminders] = await Promise.all([
    admin.rpc("expire_stale_payments", {}),
    admin.rpc("queue_appointment_reminders"),
  ]);
  if (expired.error) console.error("[cron] expire", expired.error.message);
  if (reminders.error) console.error("[cron] reminders", reminders.error.message);

  const sms = await dispatchSms(50);
  return NextResponse.json({ expired: expired.data ?? 0, reminders: reminders.data ?? 0, sms });
}

export const GET = run;
export const POST = run;
