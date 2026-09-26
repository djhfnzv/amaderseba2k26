import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { ForDoctors } from "@/components/landing/for-doctors";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { EmergencyNotice, SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { Specialties } from "@/components/landing/specialties";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <Specialties />
        <ForDoctors />
        <Faq />
      </main>
      <EmergencyNotice />
      <SiteFooter />
    </>
  );
}
