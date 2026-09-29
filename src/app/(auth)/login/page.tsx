import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/alert";
import { SIGNED_OUT_REASON } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · MedLife" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error, reason } = await searchParams;
  const signedOut = typeof reason === "string" ? SIGNED_OUT_REASON[reason] : undefined;
  return (
    <AuthCard
      title="Log in"
      subtitle="Welcome back. Log in to manage your appointments."
      footer={
        <>
          New to MedLife?{" "}
          <Link href="/signup" className="font-semibold text-teal-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {signedOut && (
        <div className="mb-4 animate-fade-down rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          {signedOut}
        </div>
      )}
      {error === "link_invalid" && (
        <div className="mb-4">
          <Alert>That link is invalid or has expired. Please try again.</Alert>
        </div>
      )}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </AuthCard>
  );
}
