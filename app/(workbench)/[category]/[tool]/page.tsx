import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { SeoContent } from "@/components/tool/SeoContent";
import { ImageConvertStudio } from "@/components/tool/ImageConvertStudio";
import { ImageConverterHero } from "@/components/tool/ImageConverterHero";
import { ToolHeader } from "@/components/tool/ToolHeader";
import { ToolWorkspace } from "@/components/tool/ToolWorkspace";
import { getCategory, getTool, tools } from "@/lib/registry/tools";
import { toolMetadata } from "@/lib/seo/metadata";
import { toolJsonLd } from "@/lib/seo/schema";

export const dynamicParams = false;

type ToolParams = { params: Promise<{ category: string; tool: string }> };

export function generateStaticParams() {
  return tools.map((tool) => ({ category: tool.category, tool: tool.slug }));
}

export async function generateMetadata({ params }: ToolParams): Promise<Metadata> {
  const { category, tool: slug } = await params;
  const tool = getTool(category, slug);
  return tool ? toolMetadata(tool) : {};
}

export default async function ToolPage({ params }: ToolParams) {
  const { category: categorySlug, tool: slug } = await params;
  const tool = getTool(categorySlug, slug);
  const category = getCategory(categorySlug);

  if (!tool || !category) notFound();

  const isImageConverter = tool.path === "/image/convert";

  return (
    <>
      <JsonLd data={toolJsonLd(tool, category)} />

      {isImageConverter ? (
        <>
          <ImageConverterHero tool={tool} category={category} />
          <section className="mt-5">
            <ImageConvertStudio
              path={tool.path}
              maxSizeMB={tool.limits.maxSizeMB ?? 25}
            />
          </section>
        </>
      ) : (
        <>
          <ToolHeader tool={tool} category={category} />
          <section className="mt-6">
            <ToolWorkspace tool={tool} />
          </section>
        </>
      )}

      <SeoContent tool={tool} category={category} />
    </>
  );
}
