import "server-only";
import { after } from "next/server";
import { sendSms, smsProvider } from "@/lib/sms/provider";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_ATTEMPTS = 4;

export type DispatchResult = { sent: number; failed: number; retrying: number };

/** Sends due messages from sms_outbox. Safe to run in parallel (rows are claimed). */
export async function dispatchSms(limit = 20): Promise<DispatchResult> {
  const admin = createAdminClient();
  const { data: batch, error } = await admin.rpc("claim_sms", { p_limit: limit });
  if (error) {
    console.error("[dispatchSms] claim", error.message);
    return { sent: 0, failed: 0, retrying: 0 };
  }

  const result: DispatchResult = { sent: 0, failed: 0, retrying: 0 };
  const provider = smsProvider();
  for (const msg of batch ?? []) {
    const res = await sendSms(msg.phone, msg.body);
    if (res.ok) {
      result.sent++;
      await admin
        .from("sms_outbox")
        .update({ status: "sent", provider, provider_ref: res.ref, error: null, sent_at: new Date().toISOString() })
        .eq("id", msg.id);
    } else if (res.retry && msg.attempts < MAX_ATTEMPTS) {
      result.retrying++;
      // 2, 4, 8 minutes…
      const wait = 2 ** msg.attempts * 60_000;
      await admin
        .from("sms_outbox")
        .update({ status: "pending", provider, error: res.error, not_before: new Date(Date.now() + wait).toISOString() })
        .eq("id", msg.id);
    } else {
      result.failed++;
      await admin.from("sms_outbox").update({ status: "failed", provider, error: res.error }).eq("id", msg.id);
    }
  }
  return result;
}

/**
 * Send any SMS the last action queued, after the response is sent.
 * The every-minute scheduler catches anything this misses.
 */
export function kickSmsDispatch() {
  after(async () => {
    try {
      await dispatchSms();
    } catch (e) {
      console.error("[kickSmsDispatch]", (e as Error).message);
    }
  });
}
