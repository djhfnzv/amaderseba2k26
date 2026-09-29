import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LoginSplash } from "@/components/motion/login-splash";
import { site } from "@/lib/site";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/motion/navigation-progress";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  openGraph: {
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html data-scroll-behavior="smooth"
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
        <LoginSplash />
      </body>
    </html>
  );
}
