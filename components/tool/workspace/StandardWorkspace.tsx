import { FileStack, Info, Music2, Mic2 } from "lucide-react";
import type { Tool } from "@/lib/registry/tools";
import {
  ActionBar,
  ChoiceCards,
  Dropzone,
  Field,
  RangeField,
  SelectField,
  Toggle,
  WorkspaceGrid,
  WorkspaceHistory,
} from "./primitives";

const actions: Record<string, string> = {
  "/image/convert": "Convert image",
  "/image/compress": "Compress image",
  "/image/to-pdf": "Create PDF",
  "/image/upscaler": "Upscale image",
  "/image/remove-background": "Remove background",
  "/document/merge-pdf": "Merge PDFs",
  "/document/split-pdf": "Split PDF",
  "/document/pdf-to-jpg": "Convert pages",
  "/document/ocr": "Extract text",
  "/audio/convert": "Convert audio",
  "/audio/vocal-remover": "Separate track",
};

export function StandardWorkspace({ tool }: { tool: Tool }) {
  const multiple = tool.path === "/image/to-pdf" || tool.path === "/document/merge-pdf";

  return (
    <>
      <WorkspaceGrid settings={<Settings tool={tool} />}>
        <Dropzone
          tool={tool}
          multiple={multiple}
          checkerboard={tool.path === "/image/remove-background"}
        />

        {multiple && (
          <div className="mt-3 flex items-center gap-3 rounded-[11px] border border-line bg-[#fdfdfc] px-3.5 py-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rail text-muted">
              <FileStack size={15} strokeWidth={1.5} aria-hidden />
            </span>
            <div>
              <p className="text-ui font-medium text-ink">Your file queue</p>
              <p className="mt-0.5 text-micro text-faint">Added files can be reordered here before creating the output.</p>
            </div>
          </div>
        )}

        {tool.path === "/audio/vocal-remover" && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <OutputCard icon="mic" title="Vocals" copy="Isolated acapella track" />
            <OutputCard icon="music" title="Instrumental" copy="Track without lead vocals" />
          </div>
        )}

        <ActionBar tool={tool} label={actions[tool.path] ?? "Run tool"} />
      </WorkspaceGrid>
      <WorkspaceHistory tool={tool} />
    </>
  );
}

function Settings({ tool }: { tool: Tool }) {
  switch (tool.path) {
    case "/image/convert":
      return (
        <>
          <SelectField label="Output format" options={["PNG", "JPG", "WebP"]} defaultValue="WebP" />
          <RangeField label="Image quality" defaultValue={90} left="Smaller file" right="Better detail" />
          <SelectField label="Color profile" options={["Keep original", "sRGB", "Grayscale"]} />
          <Toggle label="Preserve metadata" description="Keep camera and image information when supported." />
          <InfoBox>Output keeps the original width and height. Use Resize & Crop to change dimensions.</InfoBox>
        </>
      );
    case "/image/compress":
      return (
        <>
          <ChoiceCards
            label="Compression"
            choices={[
              { value: "balanced", title: "Balanced", description: "Best for most images" },
              { value: "maximum", title: "Maximum", description: "Smallest file size" },
            ]}
          />
          <RangeField label="Target quality" defaultValue={80} left="More savings" right="More detail" />
          <SelectField label="Output format" options={["Keep original", "WebP", "JPG", "PNG"]} />
          <Toggle label="Remove metadata" description="Remove non-essential camera and location data." defaultChecked />
          <InfoBox>An estimated size comparison will appear before you download the compressed image.</InfoBox>
        </>
      );
    case "/image/to-pdf":
      return (
        <>
          <SelectField label="Page size" options={["Fit to image", "A4", "Letter", "A3"]} />
          <ChoiceCards
            label="Orientation"
            choices={[
              { value: "auto", title: "Automatic" },
              { value: "portrait", title: "Portrait" },
              { value: "landscape", title: "Landscape" },
            ]}
          />
          <SelectField label="Page margin" options={["None", "Small", "Medium", "Large"]} defaultValue="Small" />
          <SelectField label="Image fit" options={["Fit within page", "Fill page", "Actual size"]} />
          <Toggle label="One image per page" defaultChecked />
        </>
      );
    case "/image/upscaler":
      return (
        <>
          <ChoiceCards
            label="Upscale factor"
            choices={[
              { value: "2x", title: "2×", description: "Faster, natural detail" },
              { value: "4x", title: "4×", description: "Maximum enlargement" },
            ]}
          />
          <SelectField label="Enhancement model" options={["Balanced", "Fine detail", "Illustration"]} />
          <SelectField label="Output format" options={["PNG", "JPG", "WebP"]} />
          <RangeField label="Detail recovery" defaultValue={65} left="Natural" right="Enhanced" />
          <Toggle label="Refine faces" description="Prioritize natural facial features in portraits." defaultChecked />
          <InfoBox>The final dimensions and credit cost are confirmed before the run starts.</InfoBox>
        </>
      );
    case "/image/remove-background":
      return (
        <>
          <ChoiceCards
            label="Background"
            choices={[
              { value: "transparent", title: "Transparent", description: "PNG cut-out" },
              { value: "white", title: "Solid color", description: "Clean backdrop" },
            ]}
          />
          <SelectField label="Subject" options={["Auto detect", "Person", "Product", "Animal"]} />
          <RangeField label="Edge refinement" defaultValue={70} left="Soft" right="Precise" />
          <SelectField label="Output size" options={["Keep original", "Crop to subject"]} />
          <Toggle label="Restore fine hair" description="Preserve wispy edges around hair and fur." defaultChecked />
        </>
      );
    case "/document/merge-pdf":
      return (
        <>
          <SelectField label="Page size" options={["Keep original sizes", "Normalize to A4", "Normalize to Letter"]} />
          <SelectField label="Orientation" options={["Keep original", "Auto rotate pages"]} />
          <Toggle label="Create bookmarks" description="Add a bookmark for each source document." defaultChecked />
          <Toggle label="Include all pages" description="Disable to choose ranges for individual files." defaultChecked />
          <SelectField label="Output compression" options={["Balanced", "Best quality", "Smallest file"]} />
          <InfoBox>Drag the queued files into the order you want them to appear in the merged PDF.</InfoBox>
        </>
      );
    case "/document/split-pdf":
      return (
        <>
          <ChoiceCards
            label="Split method"
            choices={[
              { value: "ranges", title: "Page ranges", description: "Choose exact pages" },
              { value: "every", title: "Every page", description: "One PDF per page" },
            ]}
          />
          <Field label="Pages to extract" hint="e.g. 1–5, 8, 12–14">
            <input
              aria-label="Pages to extract"
              defaultValue="1–5"
              className="h-9 w-full rounded-[9px] border border-line bg-white px-3 text-ui outline-none focus:border-[#bbbbb6]"
            />
          </Field>
          <SelectField label="Output" options={["Separate PDF files", "One PDF with selected pages"]} />
          <Toggle label="Download as ZIP" description="Bundle multiple output documents together." defaultChecked />
          <InfoBox>A page thumbnail selector will appear here after a PDF is added.</InfoBox>
        </>
      );
    case "/document/pdf-to-jpg":
      return (
        <>
          <Field label="Pages" hint="All pages by default">
            <input
              aria-label="PDF pages to convert"
              placeholder="e.g. 1–5, 8, 12"
              className="h-9 w-full rounded-[9px] border border-line bg-white px-3 text-ui outline-none placeholder:text-faint focus:border-[#bbbbb6]"
            />
          </Field>
          <SelectField label="Image resolution" options={["150 DPI", "300 DPI", "600 DPI"]} defaultValue="300 DPI" />
          <RangeField label="JPG quality" defaultValue={92} left="Smaller file" right="Better detail" />
          <SelectField label="Color mode" options={["Original color", "Grayscale"]} />
          <Toggle label="Download as ZIP" defaultChecked />
        </>
      );
    case "/document/ocr":
      return (
        <>
          <SelectField label="Document language" options={["Auto detect", "English", "Hindi", "English + Hindi"]} />
          <SelectField label="Output format" options={["Plain text (.txt)", "Searchable PDF", "Word document (.docx)"]} />
          <Field label="Page range" hint="Optional">
            <input
              aria-label="OCR page range"
              placeholder="All pages"
              className="h-9 w-full rounded-[9px] border border-line bg-white px-3 text-ui outline-none placeholder:text-faint focus:border-[#bbbbb6]"
            />
          </Field>
          <Toggle label="Preserve layout" description="Keep paragraphs, columns and line breaks where possible." defaultChecked />
          <Toggle label="Detect tables" description="Recognize rows and columns in scanned tables." />
          <InfoBox>The extracted text will be editable in a result panel before download.</InfoBox>
        </>
      );
    case "/audio/convert":
      return (
        <>
          <SelectField label="Output format" options={["MP3", "WAV", "M4A", "OGG"]} />
          <SelectField label="Bitrate" options={["128 kbps", "192 kbps", "256 kbps", "320 kbps"]} defaultValue="192 kbps" />
          <SelectField label="Sample rate" options={["Keep original", "44.1 kHz", "48 kHz", "96 kHz"]} />
          <ChoiceCards
            label="Channels"
            choices={[
              { value: "original", title: "Original" },
              { value: "stereo", title: "Stereo" },
              { value: "mono", title: "Mono" },
            ]}
          />
          <Toggle label="Normalize volume" description="Balance the output to a consistent listening level." />
        </>
      );
    case "/audio/vocal-remover":
      return (
        <>
          <ChoiceCards
            label="Separation"
            choices={[
              { value: "both", title: "Two stems", description: "Vocals + instrumental" },
              { value: "karaoke", title: "Karaoke", description: "Instrumental only" },
            ]}
          />
          <SelectField label="Separation quality" options={["Balanced", "High quality", "Fast preview"]} defaultValue="High quality" />
          <SelectField label="Output format" options={["MP3", "WAV"]} />
          <RangeField label="Vocal suppression" defaultValue={90} left="Gentle" right="Maximum" />
          <Toggle label="Reduce artifacts" description="Apply extra cleanup around the separated vocal." defaultChecked />
          <InfoBox>Processing time depends on track length. The exact credit cost is shown before the run.</InfoBox>
        </>
      );
    default:
      return null;
  }
}

function InfoBox({ children }: { children: string }) {
  return (
    <div className="flex gap-2 rounded-[10px] border border-line bg-rail p-3 text-micro leading-relaxed text-muted">
      <Info size={13} className="mt-0.5 shrink-0 text-faint" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

function OutputCard({ icon, title, copy }: { icon: "mic" | "music"; title: string; copy: string }) {
  const Icon = icon === "mic" ? Mic2 : Music2;
  return (
    <div className="flex items-center gap-3 rounded-[11px] border border-line bg-[#fdfdfc] p-3">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-rail text-muted">
        <Icon size={16} strokeWidth={1.5} aria-hidden />
      </span>
      <div>
        <p className="text-ui font-medium">{title}</p>
        <p className="mt-0.5 text-micro text-faint">{copy}</p>
      </div>
    </div>
  );
}
