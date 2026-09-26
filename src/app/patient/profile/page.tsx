import type { Metadata } from "next";
import { WelcomeSteps } from "@/components/patient/welcome-steps";
import { requireRole } from "@/lib/auth/guards";
import { getHealthProfile } from "@/lib/patient/queries";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Health profile · MedLife" };

export default async function HealthProfilePage({ searchParams }: PageProps<"/patient/profile">) {
  const user = await requireRole("patient", "/patient/profile");
  const [{ welcome }, profile] = await Promise.all([searchParams, getHealthProfile(user.id)]);
  const isWelcome = welcome === "1";

  return (
    <div className="mx-auto max-w-3xl">
      {isWelcome && <WelcomeSteps current={1} />}
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Health profile</h1>
      <p className="mt-1 text-slate-600">
        Only you and the doctors you book with can see this information.
      </p>
      <div className="mt-6">
        <ProfileForm profile={profile} welcome={isWelcome} />
      </div>
    </div>
  );
}
