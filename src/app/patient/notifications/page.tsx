import type { Metadata } from "next";
import { NotificationsPage } from "@/components/notifications/notifications-page";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Notifications · MedLife" };

export default async function PatientNotificationsPage({ searchParams }: PageProps<"/patient/notifications">) {
  const user = await requireRole("patient", "/patient/notifications");
  return <NotificationsPage user={user} basePath="/patient/notifications" searchParams={await searchParams} />;
}
