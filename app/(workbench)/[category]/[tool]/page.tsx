import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { SeoContent } from "@/components/tool/SeoContent";
import { ImageConvertStudio } from "@/components/tool/ImageConvertStudio";
import { ImageConverterHero } from "@/components/tool/ImageConverterHero";
import { CompressorHero } from "@/components/tool/compress/CompressorHero";
import { CompressorStudio } from "@/components/tool/compress/CompressorStudio";
import { ResizeCropHero } from "@/components/tool/resize/ResizeCropHero";
import { ResizeCropStudio } from "@/components/tool/resize/ResizeCropStudio";
import { ImageToPdfHero } from "@/components/tool/to-pdf/ImageToPdfHero";
import { ImageToPdfStudio } from "@/components/tool/to-pdf/ImageToPdfStudio";
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

  let workspace = (
    <>
      <ToolHeader tool={tool} category={category} />
      <section className="mt-6">
        <ToolWorkspace tool={tool} />
      </section>
    </>
  );

  if (tool.path === "/image/convert") {
    workspace = (
      <>
        <ImageConverterHero tool={tool} category={category} />
        <section className="mt-5">
          <ImageConvertStudio path={tool.path} maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/image/compress") {
    workspace = (
      <>
        <CompressorHero tool={tool} category={category} />
        <section className="mt-5">
          <CompressorStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/image/resize") {
    workspace = (
      <>
        <ResizeCropHero tool={tool} category={category} />
        <section className="mt-5">
          <ResizeCropStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/image/to-pdf") {
    workspace = (
      <>
        <ImageToPdfHero tool={tool} category={category} />
        <section className="mt-5">
          <ImageToPdfStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  return (
    <>
      <JsonLd data={toolJsonLd(tool, category)} />
      {workspace}
      <SeoContent tool={tool} category={category} />
    </>
  );
}
