import type { Metadata } from "next";
import { MyComplaintsPage } from "@/components/complaints/my-pages";

export const metadata: Metadata = { title: "Help & complaints · MedLife" };

export default function PatientComplaintsPage() {
  return <MyComplaintsPage role="patient" />;
}
