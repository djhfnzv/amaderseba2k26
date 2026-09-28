import type { Metadata } from "next";
import { NotificationsPage } from "@/components/notifications/notifications-page";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Notifications · MedLife" };

export default async function AdminNotificationsPage({ searchParams }: PageProps<"/admin/notifications">) {
  const user = await requireRole("admin", "/admin/notifications");
  return <NotificationsPage user={user} basePath="/admin/notifications" searchParams={await searchParams} />;
}
