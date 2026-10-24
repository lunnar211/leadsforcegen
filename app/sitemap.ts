import type { MetadataRoute } from "next";
import { seoPages } from "@/lib/seo-pages";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/dashboard`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    // Programmatic SEO pages: one genuine page per city x profession.
    ...seoPages().map(({ city, niche }) => ({
      url: `${SITE_URL}/leads/${city.slug}/${niche.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
