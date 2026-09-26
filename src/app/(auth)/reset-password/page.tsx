import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { requireUser } from "@/lib/auth/guards";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set new password · MedLife" };

export default async function ResetPasswordPage() {
  // The reset link signs the user in; without a session there is nothing to reset.
  await requireUser();
  return (
    <AuthCard
      title="Set a new password"
      subtitle="Choose a strong password you don't use elsewhere."
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
