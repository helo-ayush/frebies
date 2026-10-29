import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, ChevronGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { PagePaper } from "./PagePreview";

export type DocumentArtVariant = "merge" | "split" | "pages" | "text" | "edit";

const COPY: Record<
  DocumentVariant,
  { studio: string; description: string; bullets: [string, string, string] }
> = {
  merge: {
    studio: "Merge studio",
    description:
      "Combine quotes, invoices and reports into one clean document. Set the order, add bookmarks and keep every page exactly as it was.",
    bullets: ["Reorder full documents", "Bookmarks and page numbers", "Nothing leaves this device"],
  },
  split: {
    studio: "Split studio",
    description:
      "Pull out the pages you need, or break a long document into smaller files. Pick pages on the grid or type exact ranges.",
    bullets: ["Extract any page range", "Split every N pages", "Keeps the original quality"],
  },
  pages: {
    studio: "Page studio",
    description:
      "Turn selected PDF pages into clean JPG, PNG or WebP images. Choose the resolution and quality before you export.",
    bullets: ["Page-by-page selection", "Up to 300 DPI", "JPG, PNG and WebP"],
  },
  text: {
    studio: "OCR studio",
    description:
      "Turn scans and screenshots into text you can edit. Keep the layout, pick a language and copy the result in one click.",
    bullets: ["Layout or plain text", "Multiple languages", "Clear credit pricing"],
  },
  edit: {
    studio: "AI editor",
    description:
      "Describe the change you want and review a before-and-after diff before anything is replaced. Your original stays untouched.",
    bullets: ["Edit text inside a PDF", "Review before download", "Failed runs are refunded"],
  },
};

type DocumentVariant = DocumentArtVariant;

export function DocumentHero({
  tool,
  category,
  variant,
  anchor,
  action,
}: {
  tool: Tool;
  category: Category;
  variant: DocumentArtVariant;
  anchor: string;
  action?: string;
}) {
  const copy = COPY[variant];

  return (
    <header className="relative overflow-hidden rounded-[30px] border border-line bg-[#f3f1f7]">
      <div
        aria-hidden
        className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#efeafd_0%,#d3c9ec_48%,#a8a0d2_100%)] opacity-55"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 left-[32%] h-60 w-60 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fbf1e4_0%,#ecd6bc_50%,#cbae8d_100%)] opacity-40"
      />

      <div className="relative grid gap-10 px-5 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] xl:items-center xl:px-11 xl:py-11">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-micro font-medium text-[#756d82]">
            <Link href={`/${category.slug}`} className="transition-colors hover:text-ink">
              {category.title}
            </Link>
            <ChevronGlyph size={11} className="text-[#948ca1]" />
            <span className="text-[#665f73]">{copy.studio}</span>
          </nav>

          <div className="mt-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-white/80 bg-white/65 text-ink backdrop-blur-sm">
              <ToolGlyph path={tool.path} size={21} />
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {tool.tier === "credits" ? (
                <Badge tone="credits">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {tool.creditCost} {tool.creditCost === 1 ? "credit" : "credits"}
                </Badge>
              ) : (
                <Badge tone="free">Free</Badge>
              )}
              <Badge tone="neutral">Interface preview</Badge>
            </div>
          </div>

          <h1 className="mt-5 font-display text-[clamp(2.45rem,5vw,4.1rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-ink">
            {tool.h1}
          </h1>
          <p className="mt-3 max-w-[550px] text-[15px] leading-relaxed text-[#655f72]">
            {copy.description}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#6b6478]">
            {copy.bullets.map((bullet) => (
              <span key={bullet} className="flex items-center gap-1.5">
                <Check size={12} className="text-ink" aria-hidden />
                {bullet}
              </span>
            ))}
          </div>

          <Link href={`#${anchor}`} className={buttonClasses("primary", "md", "mt-6 rounded-full px-5")}>
            {action ?? `Open the ${copy.studio.toLowerCase()}`}
            <ArrowRightGlyph size={14} />
          </Link>
        </div>

        <DocumentArt variant={variant} />
      </div>
    </header>
  );
}

function DocumentArt({ variant }: { variant: DocumentArtVariant }) {
  return (
    <div aria-hidden className="relative hidden min-h-[310px] xl:block">
      {variant === "merge" && <MergeArt />}
      {variant === "split" && <SplitArt />}
      {variant === "pages" && <PagesArt />}
      {variant === "text" && <TextArt />}
      {variant === "edit" && <EditArt />}
    </div>
  );
}

function MergeArt() {
  return (
    <>
      <span className="absolute left-0 top-4 w-[112px] -rotate-[8deg] rounded-[7px] border border-white/80 bg-white p-2 shadow-[0_16px_32px_rgba(58,45,82,0.12)]">
        <PagePaper index={1} weight={1} />
      </span>
      <span className="absolute left-8 top-1 w-[112px] rotate-[3deg] rounded-[7px] border border-white/80 bg-white p-2 shadow-[0_18px_34px_rgba(58,45,82,0.14)]">
        <PagePaper index={2} weight={2} />
      </span>
      <span className="absolute right-1 top-10 w-[132px] rotate-[-2deg] rounded-[8px] border border-white/80 bg-white p-2.5 shadow-[0_26px_48px_rgba(58,45,82,0.18)]">
        <PagePaper index={3} weight={3} />
      </span>
      <span className="absolute left-[126px] top-[130px] grid h-9 w-9 place-items-center rounded-full border border-white/80 bg-white text-ink shadow-sm">
        <ArrowRightGlyph size={15} />
      </span>
      <span className="absolute bottom-1 left-[86px] inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white px-2.5 py-1 text-[8.5px] font-medium text-[#655f72] shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-[#9d97cf]" />
        3 documents · 1 PDF
      </span>
    </>
  );
}

function SplitArt() {
  return (
    <>
      <span className="absolute left-1 top-2 w-[136px] -rotate-[3deg] rounded-[8px] border border-white/80 bg-white p-2.5 shadow-[0_24px_44px_rgba(58,45,82,0.16)]">
        <PagePaper index={4} weight={1} />
      </span>
      <span className="absolute right-6 top-0 w-[104px] rotate-[5deg] rounded-[7px] border border-white/80 bg-white p-2 shadow-[0_16px_32px_rgba(58,45,82,0.12)]">
        <PagePaper index={5} weight={2} />
      </span>
      <span className="absolute bottom-0 right-14 w-[104px] rotate-[-4deg] rounded-[7px] border border-white/80 bg-white p-2 shadow-[0_18px_34px_rgba(58,45,82,0.13)]">
        <PagePaper index={6} weight={3} />
      </span>
      <span className="absolute left-[150px] top-[126px] grid h-9 w-9 place-items-center rounded-full border border-white/80 bg-white text-ink shadow-sm">
        <ArrowRightGlyph size={15} />
      </span>
      <span className="absolute bottom-1 left-[26px] inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white px-2.5 py-1 text-[8.5px] font-medium text-[#655f72] shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-[#8aa896]" />
        Pages 2–6 extracted
      </span>
    </>
  );
}

function PagesArt() {
  const tiles = [
    { label: "JPG", tone: "bg-[#e8dfd2]", rotate: "-4deg", left: "left-[24px]", top: "top-[10px]" },
    { label: "PNG", tone: "bg-[#dfe6df]", rotate: "3deg", left: "left-[128px]", top: "top-[42px]" },
    { label: "WebP", tone: "bg-[#e5e0ef]", rotate: "-2deg", left: "left-[38px]", top: "top-[176px]" },
  ];
  return (
    <>
      <span className="absolute right-0 top-1 w-[128px] rotate-[2deg] rounded-[8px] border border-white/80 bg-white p-2.5 shadow-[0_24px_44px_rgba(58,45,82,0.16)]">
        <PagePaper index={2} weight={2} />
      </span>
      {tiles.map((tile) => (
        <span
          key={tile.label}
          className={`absolute ${tile.left} ${tile.top} flex h-[76px] w-[86px] ${tile.rotate} flex-col justify-between rounded-[8px] border border-white/80 ${tile.tone} p-2 shadow-[0_14px_28px_rgba(58,45,82,0.12)]`}
        >
          <span className="flex gap-1">
            <span className="h-[3px] w-6 rounded-full bg-white/70" />
            <span className="h-[3px] w-3 rounded-full bg-white/50" />
          </span>
          <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#6b6478]">
            {tile.label}
          </span>
        </span>
      ))}
      <span className="absolute left-[196px] top-[150px] grid h-9 w-9 place-items-center rounded-full border border-white/80 bg-white text-ink shadow-sm">
        <ArrowRightGlyph size={15} />
      </span>
    </>
  );
}

function TextArt() {
  return (
    <>
      <span className="absolute left-0 top-2 w-[132px] -rotate-[3deg] rounded-[8px] border border-white/80 bg-white p-2.5 shadow-[0_22px_40px_rgba(58,45,82,0.15)]">
        <PagePaper index={3} weight={3} />
      </span>
      <span className="absolute right-0 top-12 w-[192px] rounded-[10px] border border-white/80 bg-white p-3 shadow-[0_24px_46px_rgba(58,45,82,0.16)]">
        <span className="flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-[#8b8398]">
          <Sparkles size={9} className="text-accent" />
          Extracted text
        </span>
        <span className="mt-2 block space-y-1.5">
          <span className="block h-[3px] w-full rounded-full bg-[#e3dfeb]" />
          <span className="block h-[3px] w-[86%] rounded-full bg-[#e3dfeb]" />
          <span className="block h-[3px] w-[64%] rounded-full bg-[#c9c2d9]" />
          <span className="block h-[3px] w-[92%] rounded-full bg-[#e3dfeb]" />
          <span className="block h-[3px] w-[48%] rounded-full bg-[#e3dfeb]" />
        </span>
        <span className="mt-3 flex items-center justify-between border-t border-[#f0edf5] pt-2 text-[8px] text-[#9a93a7]">
          <span>English · 98%</span>
          <span className="rounded-full bg-ink px-1.5 py-0.5 text-[7px] font-medium text-white">Copy</span>
        </span>
      </span>
      <span className="absolute left-[142px] top-[150px] grid h-9 w-9 place-items-center rounded-full border border-white/80 bg-white text-ink shadow-sm">
        <ArrowRightGlyph size={15} />
      </span>
    </>
  );
}

function EditArt() {
  return (
    <>
      <span className="absolute left-1 top-0 w-[140px] -rotate-[2deg] rounded-[8px] border border-white/80 bg-white p-2.5 shadow-[0_24px_46px_rgba(58,45,82,0.16)]">
        <PagePaper index={1} weight={3} />
        <span className="absolute left-[18%] top-[42%] h-[10px] w-[54%] rounded-[2px] bg-[#f7e2c9]" />
      </span>
      <span className="absolute bottom-2 right-2 w-[188px] rotate-[1deg] rounded-[10px] border border-white/80 bg-white p-3 shadow-[0_22px_44px_rgba(58,45,82,0.16)]">
        <span className="flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-[#8b8398]">
          <Sparkles size={9} className="text-accent" />
          Your instruction
        </span>
        <span className="mt-2 block rounded-[6px] border border-[#ece7f3] bg-[#faf8fd] p-2 text-[8.5px] leading-relaxed text-[#6b6478]">
          Update the invoice date to 30 October 2026 and shorten the payment terms.
        </span>
        <span className="mt-2 flex items-center justify-between text-[8px] text-[#9a93a7]">
          <span className="rounded-full bg-ink px-1.5 py-0.5 text-[7px] font-medium text-white">
            Review changes
          </span>
          <span>3 credits</span>
        </span>
      </span>
      <span className="absolute left-[148px] top-[120px] inline-flex items-center gap-1 rounded-full border border-white/80 bg-white px-2 py-1 text-[8px] font-medium text-[#655f72] shadow-sm">
        <Check size={9} className="text-[#3d6b4a]" />
        Original kept
      </span>
    </>
  );
}
