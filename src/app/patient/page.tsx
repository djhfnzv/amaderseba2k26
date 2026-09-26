import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/layout/dashboard-placeholder";
import { getCurrentUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Dashboard · MedLife" };

export default async function PatientDashboard() {
  const user = await getCurrentUser();
  return (
    <DashboardPlaceholder
      title={`Hello${user?.full_name ? `, ${user.full_name}` : ""}`}
      description="Manage your health profile, appointments and prescriptions."
      upcoming={[
        "Health profile & medical reports",
        "Find and book doctors",
        "Upcoming appointments",
        "Prescriptions",
      ]}
    />
  );
}
