import type { Metadata } from "next";
import { NewComplaintPage } from "@/components/complaints/my-pages";

export const metadata: Metadata = { title: "New complaint · MedLife" };

export default async function PatientNewComplaintPage({ searchParams }: PageProps<"/patient/complaints/new">) {
  const { appointment } = await searchParams;
  return <NewComplaintPage role="patient" appointment={typeof appointment === "string" ? appointment : undefined} />;
}
