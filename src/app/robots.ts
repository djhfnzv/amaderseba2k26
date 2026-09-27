import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.siteUrl.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private areas and auth pages have nothing to index.
      disallow: [
        "/patient",
        "/doctor$",
        "/doctor/",
        "/admin",
        "/dashboard",
        "/auth/",
        "/verification-documents/",
        "/medical-files/",
        "/api/",
        "/reset-password",
        "/suspended",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
