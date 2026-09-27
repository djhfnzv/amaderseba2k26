import type { PaymentProvider } from "@/types/database";

export type InitiateInput = {
  tranId: string;
  amount: number;
  currency: string;
  appointmentId: string;
  customer: { name: string; email: string; phone: string };
  productName: string;
  urls: { success: string; fail: string; cancel: string; ipn: string };
};

export type InitiateResult = { ok: true; redirectUrl: string } | { ok: false; error: string };

export type ValidationResult =
  | {
      ok: true;
      tranId: string;
      valId: string;
      amount: number;
      currency: string;
      bankTranId: string | null;
      cardType: string | null;
      raw: Record<string, unknown>;
    }
  | { ok: false; error: string; raw?: Record<string, unknown> };

export type RefundInput = { bankTranId: string | null; tranId: string; amount: number; refundId: string; remarks: string };
export type RefundResult = { ok: true; ref: string | null } | { ok: false; error: string };

export interface PaymentGateway {
  name: PaymentProvider;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  /** Server-to-server check of a completed transaction. Never trust the browser redirect alone. */
  validate(valId: string, tranId: string): Promise<ValidationResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}
