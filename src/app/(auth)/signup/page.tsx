import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account · MedLife" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { as } = await searchParams;
  return (
    <AuthCard
      title="Create your account"
      subtitle="Join MedLife as a patient or a doctor."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-teal-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm defaultRole={as === "doctor" ? "doctor" : "patient"} />
    </AuthCard>
  );
}
