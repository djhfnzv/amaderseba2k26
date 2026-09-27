import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { handleGatewayCallback } from "@/lib/payments/service";
import type { PaymentProvider } from "@/types/database";

const PROVIDERS: PaymentProvider[] = ["sslcommerz", "mock"];
const EVENTS = ["success", "fail", "cancel", "ipn"] as const;
type GatewayEvent = (typeof EVENTS)[number];

/**
 * Gateway callbacks: /api/payments/{sslcommerz|mock}/{success|fail|cancel|ipn}
 * success/fail/cancel arrive as browser form POSTs and end with a redirect
 * back to the appointment; ipn is server-to-server and gets a plain 200.
 */
async function handle(request: NextRequest, ctx: RouteContext<"/api/payments/[provider]/[event]">) {
  const { provider, event } = await ctx.params;
  if (!PROVIDERS.includes(provider as PaymentProvider) || !EVENTS.includes(event as GatewayEvent)) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (provider === "mock" && process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const fields: Record<string, string> = {};
  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    form?.forEach((v, k) => {
      if (typeof v === "string") fields[k] = v;
    });
  }
  request.nextUrl.searchParams.forEach((v, k) => {
    fields[k] ??= v;
  });

  const outcome = await handleGatewayCallback(provider as PaymentProvider, event as GatewayEvent, fields);

  if (event === "ipn") {
    return NextResponse.json({ received: true, result: outcome.result });
  }

  const base = env.siteUrl.replace(/\/$/, "");
  const target = outcome.appointmentId
    ? `${base}/patient/appointments/${outcome.appointmentId}?payment=${outcome.result}`
    : `${base}/patient/appointments?payment=invalid`;
  // 303 turns the gateway's POST into a normal GET of our page (with cookies).
  return NextResponse.redirect(target, 303);
}

export const POST = handle;
export const GET = handle;
