import "server-only";
import type { PaymentProvider } from "@/types/database";
import { mockGateway } from "./mock";
import { sslcommerz } from "./sslcommerz";
import type { PaymentGateway } from "./types";

const gateways: Record<PaymentProvider, PaymentGateway> = {
  sslcommerz,
  mock: mockGateway,
};

/** Provider used for new payments. The mock gateway is refused in production. */
export function activeProvider(): PaymentProvider {
  const wanted = (process.env.PAYMENT_PROVIDER ?? "sslcommerz").toLowerCase();
  if (wanted === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PAYMENT_PROVIDER=mock is not allowed in production");
    }
    return "mock";
  }
  return "sslcommerz";
}

/** Gateway for an existing payment (refunds use the provider it was paid with). */
export function gatewayFor(provider: PaymentProvider): PaymentGateway {
  if (provider === "mock" && process.env.NODE_ENV === "production") {
    throw new Error("Mock payments cannot be processed in production");
  }
  return gateways[provider];
}

export function isMockEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && (process.env.PAYMENT_PROVIDER ?? "").toLowerCase() === "mock";
}
