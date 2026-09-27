import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth/guards";
import { getOrCreateOwnProfile } from "@/lib/doctor/queries";

export default async function DoctorLayout({ children }: LayoutProps<"/doctor">) {
  const user = await requireRole("doctor", "/doctor");
  const profile = await getOrCreateOwnProfile(user);
  return (
    <AppShell
      user={user}
      nav={[
        { href: "/doctor", label: "Dashboard", icon: "home", exact: true },
        { href: "/doctor/appointments", label: "Appointments", icon: "calendar" },
        { href: "/doctor/schedule", label: "Schedule", icon: "clock" },
        { href: "/doctor/portfolio", label: "Portfolio", icon: "id" },
        { href: "/doctor/earnings", label: "Earnings", icon: "wallet" },
        { href: "/doctor/verification", label: "Verification", icon: "shield" },
        { href: `/doctors/${profile.slug}`, label: "My public page", icon: "search", external: true },
      ]}
    >
      {children}
    </AppShell>
  );
}
