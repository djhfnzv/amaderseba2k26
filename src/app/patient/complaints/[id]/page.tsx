import type { Metadata } from "next";
import { MyComplaintDetail } from "@/components/complaints/my-pages";

export const metadata: Metadata = { title: "Complaint · MedLife" };

export default async function PatientComplaintPage({ params, searchParams }: PageProps<"/patient/complaints/[id]">) {
  const [{ id }, { filed }] = await Promise.all([params, searchParams]);
  return <MyComplaintDetail role="patient" id={id} filed={filed === "1"} />;
}
