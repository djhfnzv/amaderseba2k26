import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortfolioView } from "@/components/doctor/portfolio-view";
import { EmergencyNotice, SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { doctorPhotoUrl } from "@/lib/doctor/constants";
import { getPortfolioBySlug, type Portfolio } from "@/lib/doctor/queries";
import { env } from "@/lib/env";
import { getAvailableSlots } from "@/lib/schedule/queries";
import { site } from "@/lib/site";

function describe(p: Portfolio): string {
  const parts = [
    p.profile.headline,
    p.specialties.map((s) => s.name).join(", "),
    p.education.map((e) => e.degree).join(", "),
  ].filter(Boolean);
  const text = parts.join(" · ") || `Verified doctor on ${site.name}`;
  return `${p.profile.display_name} — ${text}. Book an online or in-person consultation on ${site.name}.`.slice(0, 300);
}

export async function generateMetadata({ params }: PageProps<"/doctors/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  if (!portfolio) return { title: `Doctor not found · ${site.name}`, robots: { index: false } };

  const { profile } = portfolio;
  const title = `${profile.display_name}${profile.headline ? `, ${profile.headline}` : ""} · ${site.name}`;
  const description = describe(portfolio);
  const photo = doctorPhotoUrl(profile.photo_path);
  const url = `${env.siteUrl}/doctors/${profile.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    // Previews of unverified profiles must never be indexed.
    robots: profile.is_verified ? undefined : { index: false, follow: false },
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      images: photo ? [{ url: photo, alt: profile.display_name }] : undefined,
    },
  };
}

function jsonLd(p: Portfolio) {
  const { profile } = p;
  return {
    "@context": "https://schema.org",
    "@type": "Physician",
    name: profile.display_name,
    description: profile.bio ?? profile.headline ?? undefined,
    url: `${env.siteUrl}/doctors/${profile.slug}`,
    image: doctorPhotoUrl(profile.photo_path) ?? undefined,
    medicalSpecialty: p.specialties.map((s) => s.name),
    knowsLanguage: profile.languages.length ? profile.languages : undefined,
    alumniOf: p.education.map((e) => ({ "@type": "EducationalOrganization", name: e.institution })),
    address: p.chambers.map((c) => ({
      "@type": "PostalAddress",
      streetAddress: c.address,
      addressLocality: c.city,
    })),
    telephone: p.chambers.find((c) => c.phone)?.phone ?? undefined,
  };
}

export default async function DoctorPublicPage({ params }: PageProps<"/doctors/[slug]">) {
  const { slug } = await params;
  // RLS returns only verified+active doctors, or the viewer's own profile.
  const portfolio = await getPortfolioBySlug(slug);
  if (!portfolio) notFound();

  const isPreview = !portfolio.profile.is_verified;
  // Public visitors get public slots; an unverified doctor previewing their own page uses their session.
  const slots = await getAvailableSlots(portfolio.profile.user_id, { days: 7, asViewer: isPreview });

  return (
    <>
      {!isPreview && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(portfolio)).replace(/</g, "\\u003c") }}
        />
      )}
      <SiteHeader />
      {isPreview && (
        <div role="note" className="border-b border-amber-200 bg-amber-50">
          <p className="mx-auto max-w-6xl px-4 py-3 text-sm text-amber-900 sm:px-6">
            <strong className="font-semibold">Preview.</strong> Only you can see this page. It becomes
            public once your account is verified.{" "}
            <Link href="/doctor/portfolio" className="font-semibold underline">
              Edit portfolio
            </Link>
          </p>
        </div>
      )}
      <main className="flex-1 bg-slate-50">
        <PortfolioView portfolio={portfolio} slots={slots} />
      </main>
      <EmergencyNotice />
      <SiteFooter />
    </>
  );
}
