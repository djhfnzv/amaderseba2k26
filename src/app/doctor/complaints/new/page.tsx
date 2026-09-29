import type { Metadata } from "next";
import { NewComplaintPage } from "@/components/complaints/my-pages";

export const metadata: Metadata = { title: "New complaint · MedLife" };

export default async function DoctorNewComplaintPage({ searchParams }: PageProps<"/doctor/complaints/new">) {
  const { appointment } = await searchParams;
  return <NewComplaintPage role="doctor" appointment={typeof appointment === "string" ? appointment : undefined} />;
}
