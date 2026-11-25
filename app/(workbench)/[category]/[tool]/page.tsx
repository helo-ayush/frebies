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
import { getCategory, getTool, tools, type Tool } from "@/lib/registry/tools";
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

  const studio = studioFor(tool);
  const hideBadges = PLAIN_HEADER.has(tool.path);

  return (
    <>
      <JsonLd data={toolJsonLd(tool, category)} />
      <ToolHeader
        tool={tool}
        category={category}
        showTierBadge={!hideBadges}
        showEngineBadge={!hideBadges}
      />
      <section className="mt-3.5">{studio ?? <ToolWorkspace tool={tool} />}</section>
      <SeoContent tool={tool} category={category} />
    </>
  );
}

/** Tools whose studio shows its own Free / Pro pricing, so the header stays plain. */
const PLAIN_HEADER = new Set([
  "/image/upscaler",
  "/audio/text-to-speech",
  "/audio/vocal-remover",
  "/video/dubbing",
]);

function studioFor(tool: Tool) {
  const size = tool.limits.maxSizeMB;
  switch (tool.path) {
    case "/image/convert":
      return <ImageConvertStudio path={tool.path} maxSizeMB={size ?? 25} />;
    case "/image/compress":
      return <CompressorStudio maxSizeMB={size ?? 25} />;
    case "/image/resize":
      return <ResizeCropStudio maxSizeMB={size ?? 25} />;
    case "/image/to-pdf":
      return <ImageToPdfStudio maxSizeMB={size ?? 25} />;
    case "/image/upscaler":
      return <UpscalerStudio maxSizeMB={size ?? 25} />;
    case "/image/remove-background":
      return <RemoveBackgroundStudio maxSizeMB={size ?? 25} />;
    case "/document/merge-pdf":
      return <MergePdfStudio maxSizeMB={size ?? 25} />;
    case "/document/split-pdf":
      return <SplitPdfStudio maxSizeMB={size ?? 25} />;
    case "/document/pdf-to-jpg":
      return <PdfToJpgStudio maxSizeMB={size ?? 25} />;
    case "/document/ocr":
      return <OcrStudio maxSizeMB={size ?? 25} />;
    case "/document/ai-editor":
      return <AiEditorStudio maxSizeMB={size ?? 25} />;
    case "/audio/convert":
      return <AudioConverterStudio maxSizeMB={size ?? 50} />;
    case "/audio/trim":
      return <AudioTrimmerStudio maxSizeMB={size ?? 50} />;
    case "/audio/text-to-speech":
      return <TextToSpeechStudio />;
    case "/audio/speech-to-text":
      return <SpeechToTextStudio maxSizeMB={size ?? 50} />;
    case "/audio/vocal-remover":
      return <VocalRemoverStudio maxSizeMB={size ?? 50} />;
    case "/video/dubbing":
      return <VideoDubbingStudio maxSizeMB={size ?? 2048} />;
    default:
      return null;
  }
}
