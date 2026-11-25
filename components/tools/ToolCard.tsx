import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import type { Tool } from "@/lib/registry/tools";
import { ToolGlyph } from "@/components/icons/NavGlyph";

export function AccessBadge({ tool }: { tool: Tool }) {
  if (tool.status === "soon") {
    return (
      <span className="inline-flex h-6 items-center rounded-full bg-[#fdf3e2] px-2.5 text-[12px] font-medium text-[#8a6320]">
        Preview
      </span>
    );
  }
  return tool.tier === "credits" ? (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-accent-soft px-2.5 text-[12px] font-semibold text-accent-deep">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
      {tool.creditCost} {tool.creditCost === 1 ? "credit" : "credits"}
    </span>
  ) : (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-[12px] font-semibold text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
      Free
    </span>
  );
}

/** Grid card: one click from the directory into the tool. */
export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link
      href={tool.path}
      className="group relative flex h-full min-h-[148px] flex-col rounded-[18px] border border-line bg-white p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#bdb6a8] hover:shadow-[0_22px_40px_-28px_rgba(15,15,16,0.45)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[13px] bg-ink text-white transition-colors group-hover:bg-accent">
          <ToolGlyph path={tool.path} size={21} />
        </span>
        <AccessBadge tool={tool} />
      </div>

      <p className="mt-4 flex items-center gap-1 text-[15.5px] font-semibold tracking-[-0.01em] text-ink">
        {tool.name}
        <ArrowUpRight
          size={15}
          className="translate-y-0.5 text-faint opacity-0 transition-[opacity,transform] group-hover:-translate-y-0 group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden
        />
      </p>
      <p className="mt-1 line-clamp-2 text-[13.5px] leading-[1.5] text-muted">{tool.tagline}</p>
    </Link>
  );
}

/** List row, used where a compact list reads better than cards. */
export function ToolRow({ tool }: { tool: Tool }) {
  return (
    <Link
      href={tool.path}
      className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-card"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-ink text-white">
        <ToolGlyph path={tool.path} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{tool.name}</p>
        <p className="mt-0.5 truncate text-[13px] text-muted">{tool.tagline}</p>
      </div>
      <span className="hidden sm:block">
        <AccessBadge tool={tool} />
      </span>
      <ChevronRight size={15} className="shrink-0 text-faint transition-colors group-hover:text-ink" aria-hidden />
    </Link>
  );
}
