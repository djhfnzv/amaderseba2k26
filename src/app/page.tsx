import { ViewTransition } from "react";
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
    // Leaving for log in / sign up (or coming back) animates the whole page.
    <ViewTransition
      enter={{ "from-auth": "landing-in", default: "none" }}
      exit={{ "to-auth": "landing-out", default: "none" }}
      default="none"
    >
      <div className="flex flex-1 flex-col">
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
      </div>
    </ViewTransition>
  );
}
