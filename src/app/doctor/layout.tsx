import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth/guards";

export default async function DoctorLayout({ children }: LayoutProps<"/doctor">) {
  const user = await requireRole("doctor", "/doctor");
  return (
    <AppShell user={user} nav={[{ href: "/doctor", label: "Dashboard" }]}>
      {children}
    </AppShell>
  );
}
