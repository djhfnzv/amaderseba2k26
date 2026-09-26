import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/layout/dashboard-placeholder";

export const metadata: Metadata = { title: "Admin · MedLife" };

export default function AdminDashboard() {
  return (
    <DashboardPlaceholder
      title="Admin panel"
      description="Operate and moderate the MedLife platform."
      upcoming={[
        "Doctor verification queue",
        "User management",
        "Payments & refunds",
        "Reports & analytics",
      ]}
    />
  );
}
