import type { Metadata } from "next";
import type { Category, Tool } from "@/lib/registry/tools";
import { absoluteUrl } from "@/lib/site";

export function toolMetadata(tool: Tool): Metadata {
  const title = `${tool.seo.title} | frebies`;
  const description = tool.seo.metaDescription;

  return {
    title: { absolute: title },
    description,
    keywords: tool.keywords,
    alternates: { canonical: tool.path },
    openGraph: {
      type: "website",
      siteName: "frebies",
      title,
      description,
      url: absoluteUrl(tool.path),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: { index: tool.status === "live", follow: true },
  };
}

export function categoryMetadata(category: Category): Metadata {
  const title = `${category.metaTitle} | frebies`;

  return {
    title: { absolute: title },
    description: category.metaDescription,
    alternates: { canonical: `/${category.slug}` },
    openGraph: {
      type: "website",
      siteName: "frebies",
      title,
      description: category.metaDescription,
      url: absoluteUrl(`/${category.slug}`),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: category.metaDescription,
    },
    robots: { index: true, follow: true },
  };
}
