import {
  AudioLines,
  Crop,
  Eraser,
  FileImage,
  FilePenLine,
  FileText,
  Image as ImageIcon,
  Layers,
  Mic,
  Minimize2,
  Music,
  ScanText,
  Scissors,
  Sparkles,
  Type,
  type LucideIcon,
} from "lucide-react";

export type CategorySlug = "image" | "document" | "audio";
export type ToolTier = "free" | "credits";
export type ToolStatus = "live" | "soon";
export type ToolEngine = "browser" | "api" | "worker";

export type Faq = { q: string; a: string };

export type Tool = {
  slug: string;
  category: CategorySlug;
  path: string;
  name: string;
  shortName?: string;
  h1: string;
  tagline: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  tier: ToolTier;
  creditCost?: number;
  engine: ToolEngine;
  status: ToolStatus;
  featured?: boolean;
  limits: {
    maxSizeMB?: number;
    formats: string[];
    maxPages?: number;
    maxDurationMin?: number;
    maxChars?: number;
  };
  resumeBehavior: "auto" | "confirm";
  seo: {
    title: string;
    metaDescription: string;
    howItWorks: string[];
    benefits: string[];
    faq: Faq[];
    related: string[];
  };
};

export type Category = {
  slug: CategorySlug;
  name: string;
  singular: string;
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  intro: string[];
  icon: LucideIcon;
  faq: Faq[];
};

export const categories: Category[] = [
  {
    slug: "image",
    name: "Images",
    singular: "Image",
    title: "Image tools",
    description: "Convert, compress, resize and enhance images.",
    metaTitle: "Free Image Tools — Convert, Compress, Resize & Upscale",
    metaDescription:
      "Free online image tools for converting, compressing and resizing pictures. Browser tools need no upload or account; AI upscaling uses credits.",
    intro: [
      "Image tools that respect your files. Converters, compressors and resizers run in your browser, so your images never leave your device.",
      "For heavier jobs, the AI upscaler and background remover use credits. The exact cost is shown before you run them, and failed runs are refunded.",
    ],
    icon: ImageIcon,
    faq: [
      {
        q: "Are the image tools free?",
        a: "Most are. Converting, compressing and resizing images cost nothing and need no account. The AI upscaler and background remover use credits.",
      },
      {
        q: "Do my images get uploaded?",
        a: "Not for browser tools. They run on your device. AI tools upload a temporary copy that is deleted after processing or within one hour.",
      },
      {
        q: "Which image formats are supported?",
        a: "JPG, PNG and WebP at launch, up to 25 MB per image. More formats will be added as the engines are connected.",
      },
      {
        q: "Do I need an account?",
        a: "Only for credit tools. Free browser tools work immediately without signing in.",
      },
    ],
  },
  {
    slug: "document",
    name: "Documents",
    singular: "Document",
    title: "Document tools",
    description: "Merge, split and convert PDFs, with AI for the hard parts.",
    metaTitle: "Free PDF Tools — Merge, Split, Convert & OCR Online",
    metaDescription:
      "Free online PDF tools to merge, split and convert documents. Browser tools keep files on your device; OCR and AI editing use credits.",
    intro: [
      "Everyday PDF jobs without the bloat. Merge, split and convert documents in your browser, with no account and no watermark.",
      "OCR and the AI PDF editor use credits because they need server processing. You always see the cost before a run.",
    ],
    icon: FileText,
    faq: [
      {
        q: "Are the PDF tools free?",
        a: "Merging, splitting and converting are free. OCR and the AI PDF editor use credits because they run on our servers.",
      },
      {
        q: "Are my documents uploaded?",
        a: "Browser tools process files on your device. Server tools use private storage and delete the files after processing or within one hour.",
      },
      {
        q: "Is there a file size limit?",
        a: "25 MB per PDF at launch. Individual tools may have lower page limits.",
      },
    ],
  },
  {
    slug: "audio",
    name: "Audio",
    singular: "Audio",
    title: "Audio tools",
    description: "Convert and trim audio, or turn speech into text and back.",
    metaTitle: "Free Audio Tools — Convert, Trim, Transcribe & Text to Speech",
    metaDescription:
      "Free online audio tools for converting and trimming files, plus AI text to speech and speech to text with clear credit pricing.",
    intro: [
      "Simple audio jobs in your browser: convert between common formats and trim a clip without installing anything.",
      "AI voice and transcription tools use credits because they rely on external models. Costs are visible before every run.",
    ],
    icon: AudioLines,
    faq: [
      {
        q: "Which audio tools are free?",
        a: "Converting and trimming are free and run in your browser. Text to speech, speech to text and vocal removal use credits.",
      },
      {
        q: "What audio formats are supported?",
        a: "MP3, WAV, M4A and OGG at launch, up to 50 MB per file.",
      },
      {
        q: "Can I use the tools on my phone?",
        a: "Yes. The workbench works on mobile browsers, though very large audio files may hit your device's memory limits.",
      },
    ],
  },
];

export const tools: Tool[] = [
  {
    slug: "convert",
    category: "image",
    path: "/image/convert",
    name: "Image Converter",
    shortName: "Convert",
    h1: "Image Converter",
    tagline: "Convert JPG, PNG and WebP — one image or a batch.",
    description:
      "Change image formats in your browser, one file or a batch. Free, private and no sign-up.",
    keywords: ["image converter", "convert image online", "jpg to png", "png to webp", "webp to jpg", "batch image converter"],
    icon: ImageIcon,
    tier: "free",
    engine: "browser",
    status: "live",
    featured: true,
    limits: { maxSizeMB: 25, formats: ["JPG", "PNG", "WebP"] },
    resumeBehavior: "auto",
    seo: {
      title: "Image Converter — Convert JPG, PNG & WebP Free",
      metaDescription:
        "Convert JPG, PNG and WebP in your browser. One image or a batch of up to 10, with quality control. Free, private and no sign-up. Up to 25 MB per image.",
      howItWorks: [
        "Choose one JPG, PNG or WebP image, or add a batch of up to 10.",
        "Pick the output format and quality you want. The settings apply to every file.",
        "Download the converted images. Nothing was uploaded.",
      ],
      benefits: [
        "Runs entirely in your browser, so your images never leave your device.",
        "Batch conversion keeps one output per input, with the original dimensions.",
        "Free with no account, no watermark and no daily limit.",
      ],
      faq: [
        {
          q: "Is this image converter free?",
          a: "Yes. Converting images is free, with no account and no watermark.",
        },
        {
          q: "Which formats can I convert between?",
          a: "JPG, PNG and WebP, up to 25 MB per image.",
        },
        {
          q: "Are my images uploaded to a server?",
          a: "No. The converter runs in your browser, so the file stays on your device.",
        },
        {
          q: "Will converting change the image dimensions?",
          a: "No. The output keeps the original width and height. Use the resize tool if you need different dimensions.",
        },
        {
          q: "Does converting to JPG lose quality?",
          a: "JPG is a lossy format. Use the quality control to balance file size and detail. PNG and WebP can preserve more detail.",
        },
        {
          q: "Can I convert several images at once?",
          a: "Yes. Add up to 10 JPG, PNG or WebP files and convert them together. Every image keeps its name and original dimensions, and the chosen format and quality apply to the whole batch.",
        },
      ],
      related: ["compress", "resize", "upscaler"],
    },
  },
  {
    slug: "compress",
    category: "image",
    path: "/image/compress",
    name: "Image Compressor",
    shortName: "Compress",
    h1: "Image Compressor",
    tagline: "Shrink images to an exact size or a percentage.",
    description:
      "Reduce JPG, PNG and WebP file sizes with quality, percentage and target-size controls.",
    keywords: [
      "image compressor",
      "compress image online",
      "reduce image size",
      "compress image to 100kb",
      "compress jpg",
      "compress png",
      "compress webp",
    ],
    icon: Minimize2,
    tier: "free",
    engine: "browser",
    status: "soon",
    featured: true,
    limits: { maxSizeMB: 25, formats: ["JPG", "PNG", "WebP"] },
    resumeBehavior: "auto",
    seo: {
      title: "Compress Image Online Free — JPG, PNG & WebP",
      metaDescription:
        "Compress JPG, PNG and WebP images in your browser. Set a quality level, an exact final size or a percentage cut. Free, private and up to 25 MB per image.",
      howItWorks: [
        "Add one image or a batch. Every file is previewed locally and never uploaded.",
        "Pick a quality level, a percentage cut, or type the exact final size you need.",
        "Compare the estimated size for each image, then download the compressed result.",
      ],
      benefits: [
        "Target-size mode tunes quality until each image fits an exact limit such as 100 KB.",
        "Batch up to 10 images with one set of controls and a per-file estimate.",
        "Runs on your device, with no account, no watermark and no upload.",
      ],
      faq: [
        {
          q: "How do I compress an image to 100 KB?",
          a: "Choose Target size, enter 100 KB, and the estimate updates instantly. Quality — and dimensions, if you allow it — are tuned until the image fits. If the target needs extreme compression, the workspace warns you before you run it.",
        },
        {
          q: "What is percentage compression?",
          a: "Percent mode cuts a fixed share of the file size, for example 70%, so every image in a batch loses the same proportion. Quality mode instead picks a quality level and reports the resulting size.",
        },
        {
          q: "Will compressing reduce image quality?",
          a: "Yes. Smaller files carry less detail. For photos, roughly 70–80% is hard to spot at normal size. Use the high-detail band for screenshots and product shots, and keep PNG when you need lossless output.",
        },
        {
          q: "Can I compress several images at once?",
          a: "Yes. Add up to 10 JPG, PNG or WebP files, set one goal, and compare the estimated size for each image before compressing.",
        },
        {
          q: "Does the compressor change image dimensions?",
          a: "Only when you choose a max dimension. By default the original width and height are kept. Downscaling is the fastest way to cut size when a target is very small.",
        },
        {
          q: "Which format gives the smallest file?",
          a: "AVIF is usually smallest, WebP is close and faster to encode, and JPG is the most compatible. PNG is lossless, so photos often get larger — use it for graphics and transparency.",
        },
        {
          q: "Why does the estimate say no saving?",
          a: "The file may already be well compressed, or you chose a lossless format. Keep “Never enlarge the file” on so the original is returned instead of a larger output.",
        },
        {
          q: "Are my images uploaded?",
          a: "No. Compression is designed to run in your browser, so images stay on your device and never reach a server.",
        },
      ],
      related: ["convert", "resize", "upscaler"],
    },
  },
  {
    slug: "resize",
    category: "image",
    path: "/image/resize",
    name: "Resize & Crop",
    shortName: "Resize",
    h1: "Resize & Crop",
    tagline: "Resize or crop images to exact dimensions.",
    description:
      "Set precise pixels, lock aspect ratios and crop with presets — all on your device.",
    keywords: [
      "resize image",
      "crop image online",
      "resize image to 1080x1080",
      "crop image to 4:5",
      "resize and crop",
      "change image dimensions",
    ],
    icon: Crop,
    tier: "free",
    engine: "browser",
    status: "soon",
    limits: { maxSizeMB: 25, formats: ["JPG", "PNG", "WebP"] },
    resumeBehavior: "auto",
    seo: {
      title: "Resize & Crop Images Online — Exact Dimensions",
      metaDescription:
        "Resize and crop images to exact dimensions in your browser. Lock aspect ratios, scale by percentage, rotate, flip and pad. Free, private and no sign-up.",
      howItWorks: [
        "Add a JPG, PNG or WebP image. It is read locally and never uploaded.",
        "Set exact pixels, scale by a percentage, or choose a crop ratio and focus point.",
        "Rotate, flip or pad the image if needed, then download the resized result.",
      ],
      benefits: [
        "Lock the aspect ratio and type one dimension — the other follows automatically.",
        "Crop presets for square, portrait, wide and story formats with a focus picker.",
        "Runs on your device with no account, no watermark and no upload.",
      ],
      faq: [
        {
          q: "How do I resize an image to exact pixels?",
          a: "Choose Dimensions, type the width and height in pixels, and the output summary updates instantly. Keep the link on to preserve the aspect ratio, or turn it off to stretch freely.",
        },
        {
          q: "Will resizing change the aspect ratio?",
          a: "Not when the link is on — the second dimension follows the first. With the link off, the image is scaled to the exact width and height you enter, which can distort it.",
        },
        {
          q: "How do I crop an image to a square or 4:5?",
          a: "Switch to Crop, pick a ratio such as 1:1 or 4:5, and choose the focus point the frame should keep. The preview shows the crop, and the export uses that ratio at full resolution.",
        },
        {
          q: "Can I enlarge an image?",
          a: "Yes. Turn off “Never upscale” and enter a larger size or percentage. Enlarging interpolates pixels, so fine detail is estimated rather than recovered. Use the AI upscaler when you need real detail.",
        },
        {
          q: "Does resizing reduce the file size?",
          a: "Usually. Fewer pixels carry less data, and choosing WebP or lowering the quality reduces it further. The workspace shows an estimate before you export.",
        },
        {
          q: "Can I rotate or flip an image?",
          a: "Yes. Rotate in 90° steps and flip horizontally or vertically from the resize studio. Transforms are previewed live and reset with one click.",
        },
        {
          q: "Are my images uploaded?",
          a: "No. Resizing and cropping are designed to run in your browser, so images stay on your device.",
        },
      ],
      related: ["convert", "compress", "to-pdf"],
    },
  },
  {
    slug: "to-pdf",
    category: "image",
    path: "/image/to-pdf",
    name: "Image to PDF",
    shortName: "To PDF",
    h1: "Image to PDF",
    tagline: "Turn one or more images into a clean PDF.",
    description:
      "Arrange JPG, PNG and WebP images into one PDF with page sizes, margins and order.",
    keywords: [
      "image to pdf",
      "jpg to pdf",
      "png to pdf",
      "convert images to pdf",
      "photos to pdf",
      "images to pdf online",
    ],
    icon: FileImage,
    tier: "free",
    engine: "browser",
    status: "soon",
    limits: { maxSizeMB: 25, formats: ["JPG", "PNG", "WebP"] },
    resumeBehavior: "auto",
    seo: {
      title: "Image to PDF — Convert JPG & PNG to PDF Free",
      metaDescription:
        "Turn JPG, PNG and WebP images into one PDF in your browser. Set page size, orientation, margins and order. Free, private, up to 20 images and no watermark.",
      howItWorks: [
        "Add one or more JPG, PNG or WebP images. They stay on your device.",
        "Choose the paper size, orientation, margins and how each image fits the page.",
        "Reorder the pages, add page numbers, and download the finished PDF.",
      ],
      benefits: [
        "Put photos, scans and screenshots into one ordered document in a single pass.",
        "A4, Letter, A5, Legal or a page that matches each image, with a printable margin.",
        "No account, no watermark and no upload — the document is assembled locally.",
      ],
      faq: [
        {
          q: "How do I turn images into a PDF?",
          a: "Add your JPG, PNG or WebP images, choose the page size and margins, then create the PDF. The studio previews every page before export.",
        },
        {
          q: "Can I put several images in one PDF?",
          a: "Yes. Add up to 20 images to one document, reorder them, and export the set as a single PDF with one page per image.",
        },
        {
          q: "Which page sizes are supported?",
          a: "A4, US Letter, A5 and Legal, plus a Fit image option that makes each page match the image dimensions. Orientation can be automatic, portrait or landscape.",
        },
        {
          q: "Can I change the page order?",
          a: "Yes. Move any page earlier or later from the preview, or reverse the whole document in one click before creating the PDF.",
        },
        {
          q: "Will converting to PDF reduce image quality?",
          a: "The quality control sets how images are re-encoded inside the PDF. Keep it high for photos and print; lower it when the document needs to stay small. You can also turn optimization off to keep the original data.",
        },
        {
          q: "What happens to transparent PNGs?",
          a: "PDF pages are opaque, so transparency is filled with the page background you choose — white by default, with cream and charcoal alternatives.",
        },
        {
          q: "Can I add page numbers?",
          a: "Yes. Turn on page numbers in Advanced and each page gets a small sequential number when the document is generated.",
        },
        {
          q: "Are my images uploaded?",
          a: "No. The PDF builder is designed to run in your browser, so the images stay on your device.",
        },
      ],
      related: ["convert", "compress", "resize"],
    },
  },
  {
    slug: "upscaler",
    category: "image",
    path: "/image/upscaler",
    name: "Image Upscaler",
    shortName: "Upscale",
    h1: "Image Upscaler",
    tagline: "Enlarge images 2× or 4× with AI.",
    description: "Recover detail while enlarging low-resolution images.",
    keywords: ["image upscaler", "upscale image", "ai image upscaler", "4x image"],
    icon: Sparkles,
    tier: "credits",
    creditCost: 2,
    engine: "api",
    status: "soon",
    featured: true,
    limits: { maxSizeMB: 25, formats: ["JPG", "PNG", "WebP"] },
    resumeBehavior: "auto",
    seo: {
      title: "Free Image Upscaler — Upscale Images 2× or 4× Online",
      metaDescription:
        "Upscale images up to 4× with AI while keeping detail. Clear credit pricing and no watermark.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["compress", "remove-background", "convert"],
    },
  },
  {
    slug: "remove-background",
    category: "image",
    path: "/image/remove-background",
    name: "Background Remover",
    shortName: "Remove BG",
    h1: "Background Remover",
    tagline: "Clean cut-outs from a single upload.",
    description: "Remove the background from product shots, portraits and more.",
    keywords: ["background remover", "remove background from image", "transparent png"],
    icon: Eraser,
    tier: "credits",
    creditCost: 1,
    engine: "api",
    status: "soon",
    limits: { maxSizeMB: 25, formats: ["JPG", "PNG", "WebP"] },
    resumeBehavior: "auto",
    seo: {
      title: "Remove Image Background Online — Transparent PNG",
      metaDescription:
        "Remove the background from an image in one click. Transparent PNG output with clear credit pricing.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["upscaler", "compress", "convert"],
    },
  },
  {
    slug: "merge-pdf",
    category: "document",
    path: "/document/merge-pdf",
    name: "Merge PDF",
    shortName: "Merge",
    h1: "Merge PDF",
    tagline: "Combine PDFs in the order you choose.",
    description: "Put multiple PDFs together into one clean document.",
    keywords: ["merge pdf", "combine pdf files", "join pdf online"],
    icon: Layers,
    tier: "free",
    engine: "browser",
    status: "soon",
    featured: true,
    limits: { maxSizeMB: 25, formats: ["PDF"] },
    resumeBehavior: "auto",
    seo: {
      title: "Merge PDF Files Online Free — Combine PDFs in Seconds",
      metaDescription:
        "Merge multiple PDF files into one document in your browser. Free, private and no sign-up.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["split-pdf", "pdf-to-jpg", "ocr"],
    },
  },
  {
    slug: "split-pdf",
    category: "document",
    path: "/document/split-pdf",
    name: "Split PDF",
    shortName: "Split",
    h1: "Split PDF",
    tagline: "Split a PDF into pages or ranges.",
    description: "Extract pages or break a large PDF into smaller files.",
    keywords: ["split pdf", "extract pdf pages", "separate pdf"],
    icon: Scissors,
    tier: "free",
    engine: "browser",
    status: "soon",
    featured: true,
    limits: { maxSizeMB: 25, formats: ["PDF"], maxPages: 100 },
    resumeBehavior: "auto",
    seo: {
      title: "Split PDF Online Free — Extract Pages from a PDF",
      metaDescription:
        "Split a PDF into separate files or extract page ranges in your browser. Free and private.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["merge-pdf", "pdf-to-jpg", "ocr"],
    },
  },
  {
    slug: "pdf-to-jpg",
    category: "document",
    path: "/document/pdf-to-jpg",
    name: "PDF to JPG",
    shortName: "PDF to JPG",
    h1: "PDF to JPG",
    tagline: "Turn PDF pages into images.",
    description: "Export selected PDF pages as high-quality JPG images.",
    keywords: ["pdf to jpg", "pdf to image", "convert pdf to jpeg"],
    icon: FileImage,
    tier: "free",
    engine: "browser",
    status: "soon",
    limits: { maxSizeMB: 25, formats: ["PDF"], maxPages: 100 },
    resumeBehavior: "auto",
    seo: {
      title: "PDF to JPG — Convert PDF Pages to Images Free",
      metaDescription:
        "Convert PDF pages into JPG images in your browser. Free, private and no sign-up.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["merge-pdf", "split-pdf", "ocr"],
    },
  },
  {
    slug: "ocr",
    category: "document",
    path: "/document/ocr",
    name: "OCR",
    shortName: "OCR",
    h1: "OCR",
    tagline: "Turn scans and screenshots into searchable text.",
    description: "Extract text from images and scanned PDFs.",
    keywords: ["ocr online", "image to text", "scan to text", "pdf ocr"],
    icon: ScanText,
    tier: "credits",
    creditCost: 1,
    engine: "api",
    status: "soon",
    limits: { maxSizeMB: 25, formats: ["JPG", "PNG", "PDF"], maxPages: 10 },
    resumeBehavior: "auto",
    seo: {
      title: "OCR Online — Extract Text from Images & PDFs",
      metaDescription:
        "Extract text from scans, screenshots and PDFs with OCR. Clear credit pricing and no subscription required.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["pdf-to-jpg", "ai-editor", "merge-pdf"],
    },
  },
  {
    slug: "ai-editor",
    category: "document",
    path: "/document/ai-editor",
    name: "AI PDF Editor",
    shortName: "AI Editor",
    h1: "AI PDF Editor",
    tagline: "Edit PDF text by describing the change you want.",
    description: "Rewrite clauses, fix details and update text inside a PDF.",
    keywords: ["ai pdf editor", "edit pdf with ai", "change pdf text"],
    icon: FilePenLine,
    tier: "credits",
    creditCost: 3,
    engine: "api",
    status: "soon",
    limits: { maxSizeMB: 25, formats: ["PDF"], maxPages: 50 },
    resumeBehavior: "auto",
    seo: {
      title: "AI PDF Editor — Edit Text Inside a PDF",
      metaDescription:
        "Edit text in a PDF by describing the change you want. Clear credit pricing and automatic refunds on failure.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["ocr", "merge-pdf", "split-pdf"],
    },
  },
  {
    slug: "convert",
    category: "audio",
    path: "/audio/convert",
    name: "Audio Converter",
    shortName: "Convert",
    h1: "Audio Converter",
    tagline: "Convert MP3, WAV, M4A and OGG in your browser.",
    description: "Change audio formats without installing anything.",
    keywords: ["audio converter", "mp3 to wav", "wav to mp3", "m4a converter"],
    icon: AudioLines,
    tier: "free",
    engine: "browser",
    status: "soon",
    limits: { maxSizeMB: 50, formats: ["MP3", "WAV", "M4A", "OGG"], maxDurationMin: 30 },
    resumeBehavior: "auto",
    seo: {
      title: "Audio Converter — Convert MP3, WAV, M4A & OGG Free",
      metaDescription:
        "Convert audio between MP3, WAV, M4A and OGG in your browser. Free, private and no sign-up.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["trim", "text-to-speech", "speech-to-text"],
    },
  },
  {
    slug: "trim",
    category: "audio",
    path: "/audio/trim",
    name: "Audio Trimmer",
    shortName: "Trim",
    h1: "Audio Trimmer",
    tagline: "Cut a clip to the exact moment.",
    description: "Trim the start or end of an audio file without re-encoding the whole thing.",
    keywords: ["audio trimmer", "trim mp3", "cut audio online"],
    icon: Scissors,
    tier: "free",
    engine: "browser",
    status: "soon",
    limits: { maxSizeMB: 50, formats: ["MP3", "WAV", "M4A", "OGG"], maxDurationMin: 30 },
    resumeBehavior: "auto",
    seo: {
      title: "Audio Trimmer — Cut MP3 & WAV Clips Online Free",
      metaDescription:
        "Trim audio files in your browser. Cut MP3, WAV, M4A or OGG clips without uploading them.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["convert", "text-to-speech", "speech-to-text"],
    },
  },
  {
    slug: "text-to-speech",
    category: "audio",
    path: "/audio/text-to-speech",
    name: "Text to Speech",
    shortName: "Text to speech",
    h1: "Text to Speech",
    tagline: "Turn text into natural-sounding voiceovers.",
    description: "Generate speech with a choice of voices and download the audio.",
    keywords: ["text to speech", "tts online", "ai voice generator", "voiceover"],
    icon: Type,
    tier: "credits",
    creditCost: 1,
    engine: "api",
    status: "soon",
    featured: true,
    limits: { formats: ["TXT"], maxChars: 10000 },
    resumeBehavior: "auto",
    seo: {
      title: "Free Text to Speech — Natural AI Voices Online",
      metaDescription:
        "Turn text into natural speech with AI voices. Clear credit pricing, no subscription required.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["speech-to-text", "trim", "convert"],
    },
  },
  {
    slug: "speech-to-text",
    category: "audio",
    path: "/audio/speech-to-text",
    name: "Speech to Text",
    shortName: "Speech to text",
    h1: "Speech to Text",
    tagline: "Transcribe audio and video with AI.",
    description: "Turn recordings into text with timestamps and speaker-friendly formatting.",
    keywords: ["speech to text", "audio transcription", "transcribe mp3", "whisper online"],
    icon: Mic,
    tier: "credits",
    creditCost: 2,
    engine: "api",
    status: "soon",
    featured: true,
    limits: { maxSizeMB: 50, formats: ["MP3", "WAV", "M4A", "OGG"], maxDurationMin: 30 },
    resumeBehavior: "auto",
    seo: {
      title: "Speech to Text — Transcribe Audio Online",
      metaDescription:
        "Transcribe audio and video files with AI. Clear credit pricing and no subscription required.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["text-to-speech", "trim", "convert"],
    },
  },
  {
    slug: "vocal-remover",
    category: "audio",
    path: "/audio/vocal-remover",
    name: "Vocal Remover",
    shortName: "Vocal remover",
    h1: "Vocal Remover",
    tagline: "Separate vocals and instrumentals from a track.",
    description: "Create a karaoke or acapella version from a song or recording.",
    keywords: ["vocal remover", "remove vocals from song", "instrumental maker"],
    icon: Music,
    tier: "credits",
    creditCost: 4,
    engine: "worker",
    status: "soon",
    limits: { maxSizeMB: 50, formats: ["MP3", "WAV", "M4A"], maxDurationMin: 10 },
    resumeBehavior: "auto",
    seo: {
      title: "Vocal Remover — Instrumental & Acapella Online",
      metaDescription:
        "Separate vocals from instrumentals with AI. Clear credit pricing and no subscription required.",
      howItWorks: [],
      benefits: [],
      faq: [],
      related: ["trim", "convert", "text-to-speech"],
    },
  },
];

export function getCategory(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}

export function getTool(category: string, slug: string): Tool | undefined {
  return tools.find((tool) => tool.category === category && tool.slug === slug);
}

export function toolsForCategory(category: string): Tool[] {
  return tools.filter((tool) => tool.category === category);
}

export function getRelatedTools(tool: Tool): Tool[] {
  return tool.seo.related
    .map((slug) => tools.find((candidate) => candidate.category === tool.category && candidate.slug === slug))
    .filter((candidate): candidate is Tool => Boolean(candidate));
}

export const liveTools = tools.filter((tool) => tool.status === "live");
export const featuredTools = tools.filter((tool) => tool.featured);
