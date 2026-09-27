import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";

// Rebuild at most once an hour.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl.replace(/\/$/, "");
  const supabase = createPublicClient();

  // Anonymous client + RLS: only verified, active doctors are returned.
  const [{ data: doctors }, { data: specialties }] = await Promise.all([
    supabase.from("doctor_profiles").select("slug, updated_at").eq("is_verified", true).limit(50000),
    supabase.from("specialties").select("slug").eq("is_active", true),
  ]);

  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/doctors`, changeFrequency: "daily", priority: 0.9 },
    ...(specialties ?? []).map((s) => ({
      url: `${base}/doctors?specialty=${s.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...(doctors ?? []).map((d) => ({
      url: `${base}/doctors/${d.slug}`,
      lastModified: d.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
