import type { Metadata } from "next";
import { LocalTime } from "@/components/ui/local-time";
import { requireRole } from "@/lib/auth/guards";
import { getPlatformSettings } from "@/lib/payments/queries";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings · Admin · MedLife" };

/** FR-A-04: commission and cancellation/refund policy. */
export default async function AdminSettingsPage() {
  await requireRole("admin", "/admin/settings");
  const settings = await getPlatformSettings();
  const gateway = process.env.PAYMENT_PROVIDER === "mock"
    ? "Test gateway (mock)"
    : (process.env.SSLCOMMERZ_SANDBOX ?? "true") !== "false"
      ? "SSLCommerz — sandbox"
      : "SSLCommerz — live";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Settings</h1>
        <p className="mt-1 text-slate-600">
          Last changed <LocalTime iso={settings.updated_at} />. Payment gateway: <strong>{gateway}</strong>.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <SettingsForm settings={settings} />
      </section>
    </div>
  );
}
