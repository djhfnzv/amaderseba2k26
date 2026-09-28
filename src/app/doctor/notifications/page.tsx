import type { Metadata } from "next";
import { NotificationsPage } from "@/components/notifications/notifications-page";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Notifications · MedLife" };

export default async function DoctorNotificationsPage({ searchParams }: PageProps<"/doctor/notifications">) {
  const user = await requireRole("doctor", "/doctor/notifications");
  return <NotificationsPage user={user} basePath="/doctor/notifications" searchParams={await searchParams} />;
}
