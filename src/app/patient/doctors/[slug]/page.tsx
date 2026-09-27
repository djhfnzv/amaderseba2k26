import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortfolioView } from "@/components/doctor/portfolio-view";
import { requireRole } from "@/lib/auth/guards";
import { getPortfolioBySlug } from "@/lib/doctor/queries";
import { getAvailableSlots } from "@/lib/schedule/queries";

export async function generateMetadata({ params }: PageProps<"/patient/doctors/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  return { title: `${portfolio?.profile.display_name ?? "Doctor"} · MedLife`, robots: { index: false } };
}

/** A doctor's profile and booking, inside the patient dashboard. */
export default async function PatientDoctorPage({ params }: PageProps<"/patient/doctors/[slug]">) {
  await requireRole("patient", "/patient/doctors");
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  // Patients book only verified, active doctors.
  if (!portfolio || !portfolio.profile.is_verified) notFound();

  const slots = await getAvailableSlots(portfolio.profile.user_id, { days: 7 });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/patient/doctors" className="text-sm font-medium text-teal-700 hover:underline">
        ← Back to search
      </Link>
      <PortfolioView portfolio={portfolio} slots={slots} bookable embedded />
    </div>
  );
}
