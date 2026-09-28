import "server-only";

/**
 * SMS gateway. SMS_PROVIDER=bulksmsbd sends through BulkSMSBD
 * (BULKSMSBD_API_KEY, BULKSMSBD_SENDER_ID); "log" (default) only records the
 * message, for local development or before the gateway account is ready.
 */
export type SmsProviderName = "bulksmsbd" | "log";

export type SendResult =
  | { ok: true; ref: string | null }
  | { ok: false; error: string; /** Worth trying again later. */ retry: boolean };

const BULKSMSBD_URL = "https://bulksmsbd.net/api/smsapi";
const BULKSMSBD_BALANCE_URL = "https://bulksmsbd.net/api/getBalanceApi";

/** BulkSMSBD codes (HTTP status is always 200; success is response_code 202). */
const BULKSMSBD_ERRORS: Record<number, { text: string; retry: boolean }> = {
  1001: { text: "Invalid mobile number", retry: false },
  1002: { text: "Sender ID is not correct or is disabled", retry: false },
  1003: { text: "Missing required fields", retry: false },
  1005: { text: "Gateway internal error", retry: true },
  1006: { text: "Balance validity expired", retry: true },
  1007: { text: "Insufficient balance", retry: true },
  1011: { text: "API key not recognised", retry: false },
  1012: { text: "Masking SMS must be in Bengali", retry: false },
  1013: { text: "Sender ID has no gateway for this API key", retry: false },
  1014: { text: "Sender type not found for this sender ID", retry: false },
  1015: { text: "Sender ID has no valid gateway", retry: false },
  1016: { text: "No active price for this sender type", retry: false },
  1017: { text: "No price for this sender type", retry: false },
  1018: { text: "Gateway account is disabled", retry: false },
  1019: { text: "Sender type price is disabled on the account", retry: false },
  1020: { text: "Parent account not found", retry: false },
  1021: { text: "Parent account has no active price", retry: false },
};

export function smsProvider(): SmsProviderName {
  return process.env.SMS_PROVIDER === "bulksmsbd" ? "bulksmsbd" : "log";
}

/** True when SMS actually leaves the building. */
export function smsIsLive(): boolean {
  return smsProvider() === "bulksmsbd" && !!process.env.BULKSMSBD_API_KEY && !!process.env.BULKSMSBD_SENDER_ID;
}

export async function sendSms(phone: string, message: string): Promise<SendResult> {
  if (smsProvider() === "log") {
    console.info(`[sms:log] to ${phone}: ${message}`);
    return { ok: true, ref: "log" };
  }

  const apiKey = process.env.BULKSMSBD_API_KEY;
  const senderId = process.env.BULKSMSBD_SENDER_ID;
  if (!apiKey || !senderId) return { ok: false, error: "BULKSMSBD_API_KEY / BULKSMSBD_SENDER_ID not set", retry: false };

  try {
    const res = await fetch(BULKSMSBD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ api_key: apiKey, type: "text", senderid: senderId, number: phone, message }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const text = await res.text();
    let json: { response_code?: number | string; message_id?: number | string; error_message?: unknown } = {};
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: `Unexpected gateway reply (HTTP ${res.status})`, retry: true };
    }
    const code = Number(json.response_code);
    if (code === 202) return { ok: true, ref: json.message_id != null ? String(json.message_id) : null };
    const known = BULKSMSBD_ERRORS[code];
    const detail = typeof json.error_message === "string" ? json.error_message : "";
    return {
      ok: false,
      error: `${code || res.status}: ${known?.text ?? (detail || "Unknown gateway error")}`.slice(0, 480),
      retry: known?.retry ?? true,
    };
  } catch (e) {
    return { ok: false, error: `Network error: ${(e as Error).message}`.slice(0, 480), retry: true };
  }
}

/** Remaining balance text from BulkSMSBD, or null when unavailable. */
export async function smsBalance(): Promise<string | null> {
  const apiKey = process.env.BULKSMSBD_API_KEY;
  if (smsProvider() !== "bulksmsbd" || !apiKey) return null;
  try {
    const res = await fetch(BULKSMSBD_BALANCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ api_key: apiKey }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (Number(json.response_code) !== 202 && json.balance == null) {
      return typeof json.error_message === "string" ? `Error: ${json.error_message}` : null;
    }
    return json.balance != null ? `৳${json.balance}` : null;
  } catch {
    return null;
  }
}
