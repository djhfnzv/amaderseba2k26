import type { Metadata } from "next";
import { MyComplaintDetail } from "@/components/complaints/my-pages";

export const metadata: Metadata = { title: "Complaint · MedLife" };

export default async function DoctorComplaintPage({ params, searchParams }: PageProps<"/doctor/complaints/[id]">) {
  const [{ id }, { filed }] = await Promise.all([params, searchParams]);
  return <MyComplaintDetail role="doctor" id={id} filed={filed === "1"} />;
}
