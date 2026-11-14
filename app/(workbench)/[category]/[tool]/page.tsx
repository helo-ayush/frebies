import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { SeoContent } from "@/components/tool/SeoContent";
import { ImageConvertStudio } from "@/components/tool/ImageConvertStudio";
import { CompressorStudio } from "@/components/tool/compress/CompressorStudio";
import { ResizeCropStudio } from "@/components/tool/resize/ResizeCropStudio";
import { ImageToPdfStudio } from "@/components/tool/to-pdf/ImageToPdfStudio";
import { MergePdfStudio } from "@/components/tool/document/merge/MergePdfStudio";
import { SplitPdfStudio } from "@/components/tool/document/split/SplitPdfStudio";
import { PdfToJpgStudio } from "@/components/tool/document/pdf-to-jpg/PdfToJpgStudio";
import { OcrStudio } from "@/components/tool/document/ocr/OcrStudio";
import { AiEditorStudio } from "@/components/tool/document/ai-editor/AiEditorStudio";
import { UpscalerStudio } from "@/components/tool/upscaler/UpscalerStudio";
import { RemoveBackgroundStudio } from "@/components/tool/remove-background/RemoveBackgroundStudio";
import { AudioConverterStudio } from "@/components/tool/audio/converter/AudioConverterStudio";
import { AudioTrimmerStudio } from "@/components/tool/audio/trim/AudioTrimmerStudio";
import { TextToSpeechStudio } from "@/components/tool/audio/tts/TextToSpeechStudio";
import { SpeechToTextStudio } from "@/components/tool/audio/stt/SpeechToTextStudio";
import { VocalRemoverStudio } from "@/components/tool/audio/vocal/VocalRemoverStudio";
import { VideoDubbingStudio } from "@/components/tool/video/dub/VideoDubbingStudio";
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
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <ImageConvertStudio path={tool.path} maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/image/compress") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <CompressorStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/image/resize") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <ResizeCropStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/image/to-pdf") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <ImageToPdfStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/document/merge-pdf") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <MergePdfStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/document/split-pdf") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <SplitPdfStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/document/pdf-to-jpg") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <PdfToJpgStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/document/ocr") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <OcrStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/document/ai-editor") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <AiEditorStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/image/upscaler") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} showTierBadge={false} showEngineBadge={false} />
        <section className="mt-5">
          <UpscalerStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/image/remove-background") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <RemoveBackgroundStudio maxSizeMB={tool.limits.maxSizeMB ?? 25} />
        </section>
      </>
    );
  }

  if (tool.path === "/audio/convert") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <AudioConverterStudio maxSizeMB={tool.limits.maxSizeMB ?? 50} />
        </section>
      </>
    );
  }

  if (tool.path === "/audio/trim") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <AudioTrimmerStudio maxSizeMB={tool.limits.maxSizeMB ?? 50} />
        </section>
      </>
    );
  }

  if (tool.path === "/audio/text-to-speech") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} showTierBadge={false} showEngineBadge={false} />
        <section className="mt-5">
          <TextToSpeechStudio />
        </section>
      </>
    );
  }

  if (tool.path === "/audio/speech-to-text") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} />
        <section className="mt-5">
          <SpeechToTextStudio maxSizeMB={tool.limits.maxSizeMB ?? 50} />
        </section>
      </>
    );
  }

  if (tool.path === "/audio/vocal-remover") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} showTierBadge={false} showEngineBadge={false} />
        <section className="mt-5">
          <VocalRemoverStudio maxSizeMB={tool.limits.maxSizeMB ?? 50} />
        </section>
      </>
    );
  }

  if (tool.path === "/video/dubbing") {
    workspace = (
      <>
        <ToolHeader tool={tool} category={category} showTierBadge={false} showEngineBadge={false} />
        <section className="mt-5">
          <VideoDubbingStudio maxSizeMB={tool.limits.maxSizeMB ?? 2048} />
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
