import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth/guards";

export default async function PatientLayout({ children }: LayoutProps<"/patient">) {
  const user = await requireRole("patient", "/patient");
  return (
    <AppShell
      user={user}
      nav={[
        { href: "/patient", label: "Dashboard", icon: "home", exact: true },
        { href: "/patient/appointments", label: "Appointments", icon: "calendar" },
        { href: "/patient/profile", label: "Health profile", icon: "heart" },
        { href: "/patient/records", label: "Medical records", icon: "file" },
        { href: "/patient/doctors", label: "Find a doctor", icon: "search" },
      ]}
    >
      {children}
    </AppShell>
  );
}
