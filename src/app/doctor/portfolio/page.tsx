import type { Metadata } from "next";
import Link from "next/link";
import { PhotoUploader } from "@/components/doctor/photo-uploader";
import { SectionEditor } from "@/components/doctor/section-editor";
import { VerificationBadge } from "@/components/doctor/verification-badge";
import { requireRole } from "@/lib/auth/guards";
import { SECTIONS, SECTION_KEYS, doctorPhotoUrl } from "@/lib/doctor/constants";
import {
  getOrCreateOwnProfile,
  getPortfolioDetails,
  listSpecialties,
} from "@/lib/doctor/queries";
import { env } from "@/lib/env";
import { BasicInfoForm } from "./basic-info-form";

export const metadata: Metadata = { title: "Portfolio · MedLife" };

export default async function PortfolioEditorPage() {
  const user = await requireRole("doctor", "/doctor/portfolio");
  const profile = await getOrCreateOwnProfile(user);
  const [details, specialties] = await Promise.all([
    getPortfolioDetails(user.id),
    listSpecialties(),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Your portfolio</h1>
          <p className="mt-1 text-slate-600">This is what patients see on your public page.</p>
        </div>
        <Link
          href={`/doctors/${profile.slug}`}
          target="_blank"
          className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          {profile.is_verified ? "View public page ↗" : "Preview page ↗"}
        </Link>
      </div>

      <VerificationBadge verified={profile.is_verified} slug={profile.slug} />

      <Card title="Photo">
        <PhotoUploader name={profile.display_name} photoUrl={doctorPhotoUrl(profile.photo_path)} />
      </Card>

      <Card title="Profile, specialties & fees">
        <BasicInfoForm
          profile={profile}
          specialties={specialties}
          selectedSpecialtyIds={details.specialties.map((s) => s.id)}
          siteUrl={env.siteUrl}
        />
      </Card>

      {SECTION_KEYS.map((key) => (
        <Card key={key} title={SECTIONS[key].title} description={SECTIONS[key].description}>
          <SectionEditor section={key} items={details[key]} />
        </Card>
      ))}
    </div>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
