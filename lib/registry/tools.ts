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
    tagline: "Convert between 12 formats: JPG, PNG, WebP, AVIF, PDF, SVG, TIFF, BMP, ICO, TGA, GIF & EPS.",
    description:
      "Convert image formats in your browser with quality and background controls. Supports 12 output formats: JPG, PNG, WebP, AVIF, PDF, SVG, TIFF, BMP, ICO, TGA, GIF and EPS. Free, on-device and no sign-up.",
    keywords: [
      "image converter",
      "convert image online",
      "heic to jpg",
      "jpg to png",
      "png to webp",
      "webp to jpg",
      "svg to png",
      "batch image converter",
      "image to ico",
      "bmp converter",
    ],
    icon: ImageIcon,
    tier: "free",
    engine: "browser",
    status: "live",
    featured: true,
    limits: { maxSizeMB: 25, formats: ["JPG", "PNG", "WebP", "AVIF", "PDF", "SVG", "TIFF", "BMP", "ICO", "TGA", "GIF", "EPS"] },
    resumeBehavior: "auto",
    seo: {
      title: "Image Converter — Convert JPG, PNG, WebP, HEIC & AVIF Free",
      metaDescription:
        "Convert JPG, PNG, WebP, AVIF, HEIC, SVG, BMP & ICO in your browser. Single image or batch conversion with quality, sizing and background controls. Free, private and no sign-up.",
      howItWorks: [
        "Choose one image or drop a batch of up to 20 files (JPG, PNG, WebP, AVIF, HEIC, SVG, BMP, ICO).",
        "Pick your target format, adjust quality, customize background color or resize as needed.",
        "Download individual converted files or click 'Download all as ZIP'. Nothing ever leaves your device.",
      ],
      benefits: [
        "Runs entirely in your browser — your images stay 100% private and are never uploaded.",
        "Batch conversion with ZIP export keeps one clean output per input with original dimensions.",
        "Includes HEIC iPhone photo decoding, vector SVG rendering, and favicon ICO generation.",
      ],
      faq: [
        {
          q: "Is this image converter free to use?",
          a: "Yes. Converting images is completely free, with no account, no watermark and no daily limit.",
        },
        {
          q: "Which image formats can I convert between?",
          a: "You can convert between JPG, PNG, WebP, AVIF, HEIC, SVG, GIF, BMP and ICO, up to 25 MB per image.",
        },
        {
          q: "Can I convert HEIC photos from my iPhone or iPad?",
          a: "Yes! Just drop your .HEIC or .HEIF photos. They are decoded directly in your browser without uploading to any server.",
        },
        {
          q: "Do my images get uploaded to a server?",
          a: "No. The entire conversion engine runs in your browser using Canvas, WebCodecs and client decoders. Your files never leave your device.",
        },
        {
          q: "Can I batch convert multiple images and download as ZIP?",
          a: "Yes. You can add up to 20 images at once. Once converted, click 'Download all as ZIP' to download them all in a single compressed file, or download each file separately.",
        },
        {
          q: "How do quality controls work?",
          a: "For lossy formats like JPG, WebP and AVIF, you can dial in quality from 1% to 100% using presets or the slider. For WebP and AVIF, you can also enable lossless mode. PNG, BMP and ICO are lossless.",
        },
        {
          q: "What happens to transparent backgrounds when converting to JPG?",
          a: "Since JPG and standard BMP do not support transparency, transparent areas are cleanly composited over your choice of background color (white, black, or custom color). PNG, WebP, AVIF and ICO retain full alpha transparency.",
        },
        {
          q: "Can I resize images during conversion?",
          a: "Yes. You can keep original dimensions, scale down by percentage (75%, 50%, 25%), or set a maximum width/height limit (like 1920px or 1280px) to optimize files for web use.",
        },
      ],
      related: ["compress", "resize", "to-pdf", "upscaler"],
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
    status: "live",
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
    status: "live",
    limits: { maxSizeMB: 25, formats: ["JPG", "PNG", "WebP"] },
    resumeBehavior: "auto",
    seo: {
      title: "Resize & Crop Images Online — Exact Dimensions",
      metaDescription:
        "Resize and crop images to exact dimensions in your browser. Lock aspect ratios, scale by percentage, rotate, flip and pad. Free, private and no sign-up.",
      howItWorks: [
        "Add a JPG, PNG or WebP image. It is read locally and never uploaded.",
        "Set exact pixels, scale by a percentage, or draw a crop with a fixed ratio or free-form handles.",
        "Rotate, flip or pad the image if needed, then download the resized result.",
      ],
      benefits: [
        "Lock the aspect ratio and type one dimension — the other follows automatically.",
        "Crop by dragging the box and its handles, with square, portrait, wide and story ratios.",
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
          a: "Switch to Crop, pick a ratio such as 1:1 or 4:5, and drag the crop box into place. Corner handles resize with the ratio locked. Choose Free when you want to drag any edge to any size.",
        },
        {
          q: "Can I crop to a free-form size?",
          a: "Yes. Choose Free in Crop mode and drag any edge or corner of the crop box. Free-form crops are not constrained, and the output dimensions follow the box exactly.",
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
    status: "live",
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
        "Upscale images 2× or 4× with AI, with face restore and denoise. 2 credits per image, clear pricing and no watermark. Up to 25 MB per image.",
      howItWorks: [
        "Add a JPG, PNG or WebP image. It stays in this browser until you run it.",
        "Pick 2× or 4×, a detail model and enhancements such as face restore.",
        "Sign in, run the upscale, and download the larger file. Failed runs are refunded.",
      ],
      benefits: [
        "2× or 4× detail recovery with separate controls for faces, noise and sharpness.",
        "The exact cost is shown before sign-in — 2 credits per image, no watermark.",
        "Private cloud processing with files deleted within one hour.",
      ],
      faq: [
        {
          q: "How much does the image upscaler cost?",
          a: "2 credits per image. New accounts get 25 free credits, and failed AI runs are refunded automatically. The cost is shown on the run button before any upload.",
        },
        {
          q: "How large can I upscale an image?",
          a: "Choose 2× or 4× on JPG, PNG or WebP files up to 25 MB. A 4× run turns a 1600 × 1200 image into 6400 × 4800.",
        },
        {
          q: "Which detail model should I use?",
          a: "Photo is the balanced default for portraits and everyday photography. Illustration keeps flat colours and clean lines, while Product protects labels and hard packaging edges.",
        },
        {
          q: "Is my image uploaded before I sign in?",
          a: "No. The image stays in your browser while you configure the upscale and sign in. It uploads only when the run starts and is deleted within one hour.",
        },
        {
          q: "Do I need an account to use the upscaler?",
          a: "Yes, because AI runs use credits and cloud processing. Sign-in happens when you click the run button; your file and settings are preserved.",
        },
        {
          q: "Will AI upscaling add detail that was not there?",
          a: "The model reconstructs plausible detail from the source rather than inventing a new scene. Check the result before using it for critical work, especially on small text and faces.",
        },
        {
          q: "Which output formats are supported?",
          a: "PNG, WebP and JPG. PNG is the safest default for detail and transparency; JPG is smaller but flattens transparency.",
        },
      ],
      related: ["remove-background", "compress", "convert"],
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
        "Remove the background from product shots, portraits and screenshots. Transparent PNG with edge refinement for 1 credit. Clear pricing, no watermark.",
      howItWorks: [
        "Add an image; it stays in this browser until you run the cutout.",
        "Choose the subject type, edge feather and the background you want.",
        "Sign in, run the removal and download a transparent PNG. Failed runs are refunded.",
      ],
      benefits: [
        "Product, person and graphic modes with edge feathering and fine-detail preservation.",
        "Transparent, solid or custom-colour backgrounds, plus an optional drop shadow.",
        "One credit per image, with private processing and files deleted within one hour.",
      ],
      faq: [
        {
          q: "How much does background removal cost?",
          a: "1 credit per image. New accounts get 25 free credits, and failed runs are refunded. The cost is shown before you sign in.",
        },
        {
          q: "Which images work best?",
          a: "Products on a simple background, portraits and screenshots work best. Use Product for packaging, Person for hair and skin, and Graphic for logos and flat illustration.",
        },
        {
          q: "Do I get a transparent PNG?",
          a: "Yes. PNG and WebP keep the alpha channel. JPG cannot store transparency, so it fills the cut-out with the background colour you choose.",
        },
        {
          q: "Can I change the background?",
          a: "Yes. Keep it transparent, fill it with white, black or a custom colour, and optionally add a soft drop shadow around the subject.",
        },
        {
          q: "Is the image uploaded before I sign in?",
          a: "No. The file stays in your browser while you set up the cutout and sign in. It uploads only when the run starts and is deleted within one hour.",
        },
        {
          q: "Can it keep hair and fine edges?",
          a: "Turn on Hair & fine detail and raise the edge feather for softer transitions. Feather at 0 for hard product edges and around 2–4 px for portraits.",
        },
        {
          q: "Do I need an account?",
          a: "Only for the AI cutout. The free image tools work without an account; this one requests sign-in at the run step and preserves your file.",
        },
      ],
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
    status: "live",
    featured: true,
    limits: { maxSizeMB: 25, formats: ["PDF"] },
    resumeBehavior: "auto",
    seo: {
      title: "Merge PDF Files Online Free — Combine PDFs in Seconds",
      metaDescription:
        "Merge multiple PDF files into one document in your browser. Reorder files, keep page ranges, add bookmarks and page numbers. Free, private and no sign-up.",
      howItWorks: [
        "Add two or more PDFs, or a single file you want to reorganise. Every file is read in your browser.",
        "Drag documents into order, pick page ranges, rotate pages and set bookmarks, numbering or document details.",
        "Merge, preview the finished file page by page, then download it with no watermark.",
      ],
      benefits: [
        "Assembled on your device, so documents never leave your browser.",
        "Keep exact page ranges, rotate pages and add a bookmark per document.",
        "Preview the merged PDF page by page before you download it.",
      ],
      faq: [
        {
          q: "Is Merge PDF free?",
          a: "Yes. Merging, page selection, rotation, page numbers and bookmarks are free and unlimited, with no account required.",
        },
        {
          q: "Are my files uploaded?",
          a: "No. Each PDF is read and assembled inside your browser. Nothing is sent to a server, and the merged file is created locally.",
        },
        {
          q: "Can I merge only some pages?",
          a: "Yes. Expand any document to keep a range like 1-3, 6, or use the odd and even shortcuts. Rotation is set per document as well.",
        },
        {
          q: "Does it add a watermark?",
          a: "No watermarks and no branding pages. The output contains only the pages you selected.",
        },
        {
          q: "Does merging reduce quality?",
          a: "No. Pages are copied rather than re-rendered, so text, images and links stay exactly as they were. Optimize only restructures the file to trim overhead.",
        },
        {
          q: "Is there a size limit?",
          a: "Up to 25 MB per file, 12 files and 1,200 pages in total. These limits keep an on-device merge fast and reliable.",
        },
      ],
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
    tagline: "Convert MP3, WAV, M4A and OGG — preview, tune, export.",
    description:
      "Preview the waveform and control bitrate, sample rate and channels in the browser.",
    keywords: ["audio converter", "mp3 to wav", "wav to mp3", "m4a converter", "ogg converter"],
    icon: AudioLines,
    tier: "free",
    engine: "browser",
    status: "live",
    limits: { maxSizeMB: 50, formats: ["MP3", "WAV", "M4A", "OGG"], maxDurationMin: 30 },
    resumeBehavior: "auto",
    seo: {
      title: "Audio Converter — Convert MP3, WAV, M4A & OGG Free",
      metaDescription:
        "Convert MP3, WAV, M4A and OGG in your browser. Preview the waveform and choose bitrate, sample rate and channels. Free, private, up to 50 MB.",
      howItWorks: [
        "Drop an MP3, WAV, M4A or OGG file. The waveform and player load locally.",
        "Pick the output format, bitrate, sample rate and channel mode.",
        "Play the source, check the estimated size, then download the converted file.",
      ],
      benefits: [
        "A real waveform player with scrubbing, so you can check the file before converting.",
        "Bitrate, sample rate and channel controls with a live size estimate.",
        "Runs on your device with no account, no upload and no watermark.",
      ],
      faq: [
        {
          q: "How do I convert an audio file?",
          a: "Choose an MP3, WAV, M4A or OGG file, set the output format and quality in the right rail, then select Convert audio. The original waveform is previewed before export.",
        },
        {
          q: "Which audio formats are supported?",
          a: "MP3, WAV, M4A and OGG, up to 50 MB and 30 minutes per file. WAV is lossless; the other formats use the bitrate you choose.",
        },
        {
          q: "Will converting reduce audio quality?",
          a: "MP3, M4A and OGG are lossy, so lower bitrates remove detail. WAV keeps the full PCM signal. Start at 192 kbps for speech and 256–320 kbps for music.",
        },
        {
          q: "Can I change the sample rate and channels?",
          a: "Yes. Choose 22.05, 44.1, 48 or 96 kHz and switch between stereo and mono. Mono is useful for voice recordings and smaller files.",
        },
        {
          q: "Are my audio files uploaded?",
          a: "No. Playback, waveform analysis and conversion all run in your browser. The encoding engine downloads once on first use, and your audio never leaves your device.",
        },
        {
          q: "Does it work on my phone?",
          a: "Yes. The player and controls are responsive, and the waveform can be scrubbed with touch or a mouse.",
        },
      ],
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
    description: "Drag a waveform selection, preview the loop and add fades.",
    keywords: ["audio trimmer", "trim mp3", "cut audio online", "trim wav", "fade audio"],
    icon: Scissors,
    tier: "free",
    engine: "browser",
    status: "live",
    limits: { maxSizeMB: 50, formats: ["MP3", "WAV", "M4A", "OGG"], maxDurationMin: 30 },
    resumeBehavior: "auto",
    seo: {
      title: "Audio Trimmer — Cut MP3 & WAV Clips Online Free",
      metaDescription:
        "Trim MP3, WAV, M4A and OGG audio in your browser. Drag the waveform selection, preview the loop and add fades. Free, private, up to 30 minutes.",
      howItWorks: [
        "Drop an audio file and let the real waveform load.",
        "Drag the two selection handles, or type exact start and end times.",
        "Preview the loop, add fades and export the trimmed clip.",
      ],
      benefits: [
        "A draggable waveform selection instead of typing blind timecodes.",
        "Loop preview, start and end time fields, and fade in/out control.",
        "Runs on your device with no account, no upload and no watermark.",
      ],
      faq: [
        {
          q: "How do I trim an audio file?",
          a: "Load a clip, drag the two orange handles across the waveform, and press play to preview the selection on loop. Enter exact times in the fields if you need precision.",
        },
        {
          q: "Does trimming re-encode the audio?",
          a: "The selection is cut sample-accurately and re-encoded to the format and bitrate you choose. WAV output stays lossless PCM.",
        },
        {
          q: "Can I add fade in and fade out?",
          a: "Yes. Set each fade from 0 to 3 seconds. Fades are applied inside the selection so both ends end cleanly.",
        },
        {
          q: "Which formats can I trim?",
          a: "MP3, WAV, M4A and OGG, up to 50 MB and 30 minutes. Choose MP3, WAV, M4A or OGG for the trimmed output.",
        },
        {
          q: "Is my audio uploaded?",
          a: "No. Everything runs on your device. The encoding engine downloads once on first use for MP3, M4A and OGG, and your audio never leaves your device.",
        },
        {
          q: "Can I trim on my phone?",
          a: "Yes. The selection handles are touch targets, and the rest of the studio stacks below the player.",
        },
      ],
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
    description: "Pick a voice, tune pace and pitch, and export MP3 or WAV.",
    keywords: ["text to speech", "tts online", "ai voice generator", "voiceover", "ai voice"],
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
        "Turn text into natural speech with AI voices. Tune pace and pitch, preview in the browser and download MP3 or WAV. 1 credit per 1,000 characters.",
      howItWorks: [
        "Paste your script, or load the sample to hear the flow.",
        "Choose a voice, language and style, then tune speed and pitch.",
        "Sign in and generate the voiceover. The exact credit cost is shown first.",
      ],
      benefits: [
        "Four distinct voices with language, style, pace and pitch controls.",
        "A local browser preview lets you test pacing before spending a credit.",
        "MP3 or lossless WAV output with a live character count and cost estimate.",
      ],
      faq: [
        {
          q: "How much does text to speech cost?",
          a: "1 credit per 1,000 characters, with a minimum of 1 credit per run. The current script's cost is shown before sign-in; failed runs are refunded.",
        },
        {
          q: "Can I preview the voice before paying?",
          a: "Yes. The player uses your browser's local system voice so you can test pace and pitch. The natural AI voice is generated when you run the tool.",
        },
        {
          q: "Which languages and voices are available?",
          a: "English (US and UK), Hindi, Spanish and French, with Aria, Kai, Mira and Noah voice characters. More voices can be added as the engine is connected.",
        },
        {
          q: "How many characters can I generate?",
          a: "Up to 10,000 characters per run. Longer scripts can be split into sections; each run shows its exact cost first.",
        },
        {
          q: "What output formats are supported?",
          a: "MP3 at 128, 192 or 320 kbps, or lossless WAV. Metadata can be kept so the title and voice name travel with the file.",
        },
        {
          q: "Is my script uploaded before I sign in?",
          a: "No. The script stays in your browser while you configure the voice. It is sent only when the run starts and is deleted within one hour.",
        },
        {
          q: "Can I use the audio commercially?",
          a: "You are responsible for having the rights to the script and for how the audio is used. Keep a copy of the generated file and follow the terms of service.",
        },
      ],
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
    description: "Timestamps, speaker labels and TXT, SRT or VTT export.",
    keywords: ["speech to text", "audio transcription", "transcribe mp3", "whisper online", "srt generator"],
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
        "Transcribe audio and video with AI. Add timestamps and speaker labels, then export TXT, SRT or VTT. 2 credits per started minute, no subscription.",
      howItWorks: [
        "Add an audio file. The waveform and duration load locally.",
        "Choose the language, model, timestamps and speaker labels.",
        "Sign in and transcribe. Edit the result, then download TXT, SRT or VTT.",
      ],
      benefits: [
        "Word-level timestamps and speaker labels for interviews and meetings.",
        "Editable transcript output in TXT, SRT or VTT format.",
        "Clear pricing at 2 credits per started minute, with failed runs refunded.",
      ],
      faq: [
        {
          q: "How much does transcription cost?",
          a: "2 credits per started minute, with a minimum of 2 credits per run. A 90-second clip costs 4 credits. The exact cost appears before sign-in.",
        },
        {
          q: "Which formats and limits are supported?",
          a: "MP3, WAV, M4A and OGG, up to 50 MB and 30 minutes per file. Longer recordings can be split into parts.",
        },
        {
          q: "Can I get timestamps and speaker labels?",
          a: "Yes. Turn on timestamps for timecoded lines and speaker labels to separate voices. SRT and VTT always include timestamps.",
        },
        {
          q: "What can I export?",
          a: "TXT for plain transcript text, SRT for video subtitles, or VTT for the web. The transcript stays editable before download.",
        },
        {
          q: "Which languages are supported?",
          a: "Auto-detect plus English, Hindi, Spanish and French. More languages can be added with the transcription engine.",
        },
        {
          q: "Is my audio uploaded?",
          a: "The file stays in your browser until the run starts. Server processing uses private temporary storage, and files are deleted within one hour.",
        },
        {
          q: "How accurate is the transcript?",
          a: "Accuracy is strongest on clear speech with little background noise. Choose the Precise model for accents, calls or noisy recordings, and review names and numbers.",
        },
      ],
      related: ["text-to-speech", "trim", "vocal-remover"],
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
    description: "Two or four stems, with mute/solo previews and WAV or MP3 export.",
    keywords: ["vocal remover", "remove vocals from song", "instrumental maker", "stem separation", "karaoke maker"],
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
        "Separate vocals and instrumentals with AI. Choose two stems or four, then download WAV or MP3 files. 4 credits per started minute, no subscription.",
      howItWorks: [
        "Add a song or recording. The waveform and duration load locally.",
        "Choose two stems for karaoke or four for a full remix session.",
        "Sign in and run the separation, then download each stem.",
      ],
      benefits: [
        "Vocals and instrumental stems for karaoke, covers and practice.",
        "Four-stem mode adds drums, bass and an “other” lane for production.",
        "Mute and solo previews, WAV or MP3 output, and 4 credits per started minute.",
      ],
      faq: [
        {
          q: "How much does vocal removal cost?",
          a: "4 credits per started minute, with a minimum of 4 credits per run. A 3-minute song costs 12 credits; the exact cost is shown before sign-in.",
        },
        {
          q: "What is the difference between two and four stems?",
          a: "Two stems gives you vocals and instrumental, perfect for karaoke or an acapella. Four stems adds drums, bass and an “other” lane for remixing.",
        },
        {
          q: "Which formats and limits are supported?",
          a: "MP3, WAV and M4A uploads up to 50 MB and 10 minutes. Stems download as lossless WAV or compressed MP3.",
        },
        {
          q: "Can I keep backing vocals in the instrumental?",
          a: "Use Keep backing vocals on the two-stem mode to include harmonies in the vocal stem; turn it off for a cleaner karaoke track. The exact result depends on the mix.",
        },
        {
          q: "Does separation always sound perfect?",
          a: "AI separation is very good on clear mixes but can leave artefacts on dense or live recordings. Preview each stem with mute and solo before using it.",
        },
        {
          q: "Is my track uploaded before I sign in?",
          a: "No. The file stays in your browser while you configure the stems. It uploads only when the run starts and is deleted within one hour.",
        },
        {
          q: "Can I use the stems commercially?",
          a: "You are responsible for holding the rights to the source recording and for how the separated stems are used.",
        },
      ],
      related: ["trim", "convert", "speech-to-text"],
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
