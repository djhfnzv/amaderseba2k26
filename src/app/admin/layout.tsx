import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth/guards";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireRole("admin", "/admin");
  return (
    <AppShell
      user={user}
      nav={[
        { href: "/admin", label: "Dashboard", icon: "home", exact: true },
        { href: "/admin/verifications", label: "Verifications", icon: "shield" },
        { href: "/admin/users", label: "Users", icon: "users" },
        { href: "/admin/payments", label: "Payments", icon: "wallet" },
        { href: "/admin/payouts", label: "Payouts", icon: "banknote" },
        { href: "/admin/settings", label: "Settings", icon: "cog" },
      ]}
    >
      {children}
    </AppShell>
  );
}
