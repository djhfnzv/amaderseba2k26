import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth/guards";

export default async function PatientLayout({ children }: LayoutProps<"/patient">) {
  const user = await requireRole("patient", "/patient");
  return (
    <AppShell
      user={user}
      nav={[
        { href: "/patient", label: "Dashboard" },
        { href: "/patient/profile", label: "Health profile" },
        { href: "/patient/records", label: "Medical records" },
      ]}
    >
      {children}
    </AppShell>
  );
}
