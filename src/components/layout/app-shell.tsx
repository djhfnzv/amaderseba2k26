import { cookies } from "next/headers";
import { SessionGuard } from "@/components/auth/session-guard";
import { ROLE_HOME } from "@/lib/auth/roles";
import { ACTIVITY_COOKIE, SESSION_IDLE_SECONDS } from "@/lib/auth/session";
import { getUnreadCount } from "@/lib/notifications/queries";
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
export async function AppShell({
  user,
  nav,
  children,
}: {
  user: AppUser;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const [unread, jar] = await Promise.all([getUnreadCount(user.id), cookies()]);
  const seen = Number(jar.get(ACTIVITY_COOKIE)?.value);
  const expiresAt = Number.isFinite(seen) && seen > 0 ? seen + SESSION_IDLE_SECONDS * 1000 : null;
  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <AppSidebar
        nav={nav}
        userId={user.id}
        unread={unread}
        homeHref={ROLE_HOME[user.role]}
        notificationsHref={`${ROLE_HOME[user.role]}/notifications`}
        userName={user.full_name || user.email || "Account"}
        roleLabel={ROLE_LABEL[user.role]}
      />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64 print:pl-0">
        <main className="@container flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10 print:p-0">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <SessionGuard initialExpiresAt={expiresAt} />
    </div>
  );
}
