import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth/guards";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireRole("admin", "/admin");
  return (
    <AppShell user={user} nav={[{ href: "/admin", label: "Dashboard" }]}>
      {children}
    </AppShell>
  );
}
