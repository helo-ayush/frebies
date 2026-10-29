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
import { UpscalerHero } from "@/components/tool/upscaler/UpscalerHero";
import { UpscalerStudio } from "@/components/tool/upscaler/UpscalerStudio";
import { RemoveBackgroundHero } from "@/components/tool/remove-background/RemoveBackgroundHero";
import { RemoveBackgroundStudio } from "@/components/tool/remove-background/RemoveBackgroundStudio";
import { AudioConverterHero } from "@/components/tool/audio/converter/AudioConverterHero";
import { AudioConverterStudio } from "@/components/tool/audio/converter/AudioConverterStudio";
import { AudioTrimmerHero } from "@/components/tool/audio/trim/AudioTrimmerHero";
import { AudioTrimmerStudio } from "@/components/tool/audio/trim/AudioTrimmerStudio";
import { TextToSpeechHero } from "@/components/tool/audio/tts/TextToSpeechHero";
import { TextToSpeechStudio } from "@/components/tool/audio/tts/TextToSpeechStudio";
import { SpeechToTextHero } from "@/components/tool/audio/stt/SpeechToTextHero";
import { SpeechToTextStudio } from "@/components/tool/audio/stt/SpeechToTextStudio";
import { VocalRemoverHero } from "@/components/tool/audio/vocal/VocalRemoverHero";
import { VocalRemoverStudio } from "@/components/tool/audio/vocal/VocalRemoverStudio";
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

  if (tool.path === "/image/upscaler") {
    workspace = (
      <>
        <UpscalerHero tool={tool} category={category} />
        <section className="mt-5">
          <UpscalerStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/image/remove-background") {
    workspace = (
      <>
        <RemoveBackgroundHero tool={tool} category={category} />
        <section className="mt-5">
          <RemoveBackgroundStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/audio/convert") {
    workspace = (
      <>
        <AudioConverterHero tool={tool} category={category} />
        <section className="mt-5">
          <AudioConverterStudio maxSizeMB={tool.limits.maxSizeMB ?? 50} />
        </section>
      </>
    );
  }

  if (tool.path === "/audio/trim") {
    workspace = (
      <>
        <AudioTrimmerHero tool={tool} category={category} />
        <section className="mt-5">
          <AudioTrimmerStudio maxSizeMB={tool.limits.maxSizeMB ?? 50} />
        </section>
      </>
    );
  }

  if (tool.path === "/audio/text-to-speech") {
    workspace = (
      <>
        <TextToSpeechHero tool={tool} category={category} />
        <section className="mt-5">
          <TextToSpeechStudio />
        </section>
      </>
    );
  }

  if (tool.path === "/audio/speech-to-text") {
    workspace = (
      <>
        <SpeechToTextHero tool={tool} category={category} />
        <section className="mt-5">
          <SpeechToTextStudio maxSizeMB={tool.limits.maxSizeMB ?? 50} />
        </section>
      </>
    );
  }

  if (tool.path === "/audio/vocal-remover") {
    workspace = (
      <>
        <VocalRemoverHero tool={tool} category={category} />
        <section className="mt-5">
          <VocalRemoverStudio maxSizeMB={tool.limits.maxSizeMB ?? 50} />
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
