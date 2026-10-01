import type { MetadataRoute } from "next";
import { features } from "@/lib/content";
import { posts } from "@/lib/posts";

export const dynamic = "force-static";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://jotoliko.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes = [
    "",
    "/fonctionnalites",
    "/solutions",
    "/tarifs",
    "/blog",
    "/a-propos",
    "/contact",
    "/faq",
    "/demo",
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.8,
  }));

  const featureRoutes = features.map((f) => ({
    url: `${baseUrl}/fonctionnalites/${f.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const postRoutes = posts.map((p) => ({
    url: `${baseUrl}/blog/${p.slug}`,
    lastModified: new Date(`${p.date}T00:00:00Z`),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...featureRoutes, ...postRoutes];
}
