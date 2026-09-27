import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Payment, PlatformSettings, Refund } from "@/types/database";

export type PaymentSummary = {
  /** The successful payment, else the most recent attempt. */
  payment: Payment | null;
  attempts: number;
  refunds: Refund[];
};

/** Payment + refunds for one appointment (RLS: participants and admins). */
export async function getPaymentSummary(appointmentId: string): Promise<PaymentSummary> {
  const supabase = await createClient();
  const [{ data: payments }, { data: refunds }] = await Promise.all([
    supabase.from("payments").select("*").eq("appointment_id", appointmentId).order("created_at", { ascending: false }),
    supabase.from("refunds").select("*").eq("appointment_id", appointmentId).order("created_at", { ascending: false }),
  ]);
  const list = payments ?? [];
  return {
    payment: list.find((p) => p.status === "paid") ?? list[0] ?? null,
    attempts: list.length,
    refunds: refunds ?? [],
  };
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("*").eq("id", 1).single();
  return (
    data ?? {
      id: 1,
      commission_percent: 10,
      refund_full_hours: 24,
      refund_partial_percent: 50,
      payment_window_minutes: 15,
      currency: "BDT",
      updated_by: null,
      updated_at: new Date(0).toISOString(),
    }
  );
}
