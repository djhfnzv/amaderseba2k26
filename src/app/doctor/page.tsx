import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/layout/dashboard-placeholder";
import { getCurrentUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Doctor dashboard · MedLife" };

export default async function DoctorDashboard() {
  const user = await getCurrentUser();
  return (
    <DashboardPlaceholder
      title={`Welcome${user?.full_name ? `, Dr. ${user.full_name}` : ""}`}
      description="Manage your portfolio, schedule and patients."
      upcoming={[
        "Portfolio builder",
        "Verification documents",
        "Weekly schedule & leave days",
        "Patient queue & prescriptions",
      ]}
    />
  );
}
