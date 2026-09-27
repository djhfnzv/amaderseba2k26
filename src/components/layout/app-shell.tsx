import type { AppUser, Role } from "@/types/database";
import { AppSidebar, type NavItem } from "./app-sidebar";

export type { NavItem };

const ROLE_LABEL: Record<Role, string> = {
  patient: "Patient",
  doctor: "Doctor",
  admin: "Admin",
};

/**
 * Frame shared by the patient, doctor and admin areas: a left sidebar on
 * desktop (top bar + menu on smaller screens) and a centered content column.
 * `@container` lets pages lay out by the space next to the sidebar, not the
 * whole screen width.
 */
export function AppShell({
  user,
  nav,
  children,
}: {
  user: AppUser;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <AppSidebar nav={nav} userName={user.full_name || user.email || "Account"} roleLabel={ROLE_LABEL[user.role]} />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <main className="@container flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
