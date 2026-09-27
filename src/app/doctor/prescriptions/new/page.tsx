import type { Metadata } from "next";
import Link from "next/link";
import { NewPrescriptionForm } from "@/components/prescriptions/new-prescription-form";
import { requireRole } from "@/lib/auth/guards";
import { listDoctorPatients } from "@/lib/prescriptions/queries";

export const metadata: Metadata = { title: "New prescription · MedLife" };

export default async function NewPrescriptionPage({ searchParams }: PageProps<"/doctor/prescriptions/new">) {
  const user = await requireRole("doctor", "/doctor/prescriptions/new");
  const { patient } = await searchParams;
  const patients = await listDoctorPatients(user.id);
  const initial = typeof patient === "string" && patients.some((p) => p.id === patient) ? patient : undefined;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/doctor/prescriptions" className="text-sm font-medium text-teal-700 hover:underline">
        ← Prescriptions
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">New prescription</h1>
        <p className="mt-1 text-slate-600">
          To link it to a visit (and pull in your consultation notes), start it from the appointment page instead.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <NewPrescriptionForm patients={patients} initialPatientId={initial} />
      </section>
    </div>
  );
}
