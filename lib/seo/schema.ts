import type { Category, Tool } from "@/lib/registry/tools";
import { absoluteUrl } from "@/lib/site";

type Json = Record<string, unknown>;

export function breadcrumbJsonLd(items: { name: string; path: string }[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function toolJsonLd(tool: Tool, category: Category): Json {
  const graph: Json[] = [
    {
      "@type": "SoftwareApplication",
      name: tool.name,
      description: tool.seo.metaDescription,
      url: absoluteUrl(tool.path),
      applicationCategory:
        tool.category === "document" ? "BusinessApplication" : "MultimediaApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript",
      featureList: tool.seo.benefits,
      offers:
        tool.tier === "free"
          ? { "@type": "Offer", price: "0", priceCurrency: "INR" }
          : { "@type": "Offer", description: `${tool.creditCost} credits per run` },
    },
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: category.title, path: `/${category.slug}` },
      { name: tool.name, path: tool.path },
    ]),
  ];

  if (tool.seo.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: tool.seo.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

export function categoryJsonLd(category: Category): Json {
  const graph: Json[] = [
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: category.title, path: `/${category.slug}` },
    ]),
    {
      "@type": "CollectionPage",
      name: category.title,
      description: category.metaDescription,
      url: absoluteUrl(`/${category.slug}`),
    },
  ];

  if (category.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: category.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}
