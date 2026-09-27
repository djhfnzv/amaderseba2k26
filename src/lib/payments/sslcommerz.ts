import "server-only";
import type { InitiateInput, PaymentGateway, RefundInput, ValidationResult } from "./types";

/**
 * SSLCommerz v4 integration.
 * Docs: https://developer.sslcommerz.com/doc/v4/
 * Sandbox and live differ only by host; credentials come from env.
 */
function config() {
  const storeId = process.env.SSLCOMMERZ_STORE_ID;
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
  if (!storeId || !storePassword) {
    throw new Error("SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD are not set");
  }
  const sandbox = (process.env.SSLCOMMERZ_SANDBOX ?? "true").toLowerCase() !== "false";
  const host = sandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
  return { storeId, storePassword, host };
}

const TIMEOUT_MS = 20_000;

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`SSLCommerz returned a non-JSON response (${res.status})`);
  }
}

const str = (v: unknown) => (v == null ? "" : String(v));

export const sslcommerz: PaymentGateway = {
  name: "sslcommerz",

  async initiate(input: InitiateInput) {
    const { storeId, storePassword, host } = config();
    const body = new URLSearchParams({
      store_id: storeId,
      store_passwd: storePassword,
      total_amount: input.amount.toFixed(2),
      currency: input.currency,
      tran_id: input.tranId,
      success_url: input.urls.success,
      fail_url: input.urls.fail,
      cancel_url: input.urls.cancel,
      ipn_url: input.urls.ipn,
      cus_name: input.customer.name.slice(0, 50),
      cus_email: input.customer.email.slice(0, 50),
      cus_phone: input.customer.phone.slice(0, 20),
      cus_add1: "Dhaka",
      cus_city: "Dhaka",
      cus_postcode: "1000",
      cus_country: "Bangladesh",
      shipping_method: "NO",
      num_of_item: "1",
      product_name: input.productName.slice(0, 100),
      product_category: "Healthcare",
      product_profile: "non-physical-goods",
      value_a: input.appointmentId,
    });

    try {
      const json = await fetchJson(`${host}/gwprocess/v4/api.php`, { method: "POST", body });
      if (json.status === "SUCCESS" && typeof json.GatewayPageURL === "string" && json.GatewayPageURL) {
        return { ok: true as const, redirectUrl: json.GatewayPageURL };
      }
      return { ok: false as const, error: str(json.failedreason) || "The payment gateway rejected the request." };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  },

  async validate(valId: string, tranId: string): Promise<ValidationResult> {
    const { storeId, storePassword, host } = config();
    const qs = new URLSearchParams({ val_id: valId, store_id: storeId, store_passwd: storePassword, v: "1", format: "json" });
    try {
      const json = await fetchJson(`${host}/validator/api/validationserverAPI.php?${qs}`);
      const status = str(json.status);
      if (status !== "VALID" && status !== "VALIDATED") {
        return { ok: false, error: `Transaction not valid (${status || "unknown"})`, raw: json };
      }
      if (str(json.tran_id) !== tranId) {
        return { ok: false, error: "Transaction id mismatch", raw: json };
      }
      return {
        ok: true,
        tranId,
        valId,
        amount: Number(json.amount),
        currency: str(json.currency) || "BDT",
        bankTranId: str(json.bank_tran_id) || null,
        cardType: str(json.card_type) || null,
        raw: {
          status,
          card_type: json.card_type,
          card_brand: json.card_brand,
          card_issuer: json.card_issuer,
          risk_level: json.risk_level,
          risk_title: json.risk_title,
          tran_date: json.tran_date,
        },
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async refund(input: RefundInput) {
    if (!input.bankTranId) return { ok: false as const, error: "Missing bank transaction id" };
    const { storeId, storePassword, host } = config();
    const qs = new URLSearchParams({
      bank_tran_id: input.bankTranId,
      refund_trans_id: input.refundId.replace(/-/g, "").slice(0, 30),
      refund_amount: input.amount.toFixed(2),
      refund_remarks: input.remarks.slice(0, 100),
      refe_id: input.refundId,
      store_id: storeId,
      store_passwd: storePassword,
      v: "1",
      format: "json",
    });
    try {
      const json = await fetchJson(`${host}/validator/api/merchantTransIDvalidationAPI.php?${qs}`);
      const status = str(json.status).toLowerCase();
      if (status === "success" || status === "processing") {
        return { ok: true as const, ref: str(json.refund_ref_id) || null };
      }
      return { ok: false as const, error: str(json.errorReason) || `Refund ${status || "failed"}` };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  },
};
