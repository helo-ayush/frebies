import type { MetadataRoute } from "next";
import { categories, tools } from "@/lib/registry/tools";
import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: absoluteUrl("/"),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...categories.map((category) => ({
      url: absoluteUrl(`/${category.slug}`),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...tools.map((tool) => ({
      url: absoluteUrl(tool.path),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
  ];
}
