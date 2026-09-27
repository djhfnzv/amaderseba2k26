import "server-only";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentGateway } from "./types";

/**
 * Offline test gateway for development only. The "gateway page" is our own
 * /pay/mock page; validation reads the amount back from our database.
 * Never enabled in production (see config.ts).
 */
export const mockGateway: PaymentGateway = {
  name: "mock",

  async initiate(input) {
    return { ok: true, redirectUrl: `${env.siteUrl}/pay/mock?tran_id=${encodeURIComponent(input.tranId)}` };
  },

  async validate(valId, tranId) {
    if (valId !== `MOCK-${tranId}`) return { ok: false, error: "Invalid mock validation id" };
    const { data } = await createAdminClient()
      .from("payments")
      .select("amount, currency, provider")
      .eq("tran_id", tranId)
      .maybeSingle();
    if (!data || data.provider !== "mock") return { ok: false, error: "Unknown mock transaction" };
    return {
      ok: true,
      tranId,
      valId,
      amount: Number(data.amount),
      currency: data.currency,
      bankTranId: `MOCKBANK-${tranId}`,
      cardType: "MOCK-CARD",
      raw: { status: "VALID", mock: true },
    };
  },

  async refund(input) {
    return { ok: true, ref: `MOCKREF-${input.refundId.slice(0, 8)}` };
  },
};
