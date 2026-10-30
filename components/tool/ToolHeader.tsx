import Link from "next/link";
import { ChevronRight, Cloud, Lock, MonitorDown } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { PointerHighlight } from "@/components/aceternity/pointer-highlight";
import { Badge } from "@/components/ui/Badge";

export function ToolHeader({ tool, category }: { tool: Tool; category: Category }) {
  const Icon = tool.icon;
  const EngineIcon = tool.engine === "browser" ? MonitorDown : Cloud;

  return (
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-line bg-rail text-ink">
          <Icon size={21} strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-micro font-medium text-faint">
            <Link href={`/${category.slug}`} className="transition-colors hover:text-ink">
              {category.title}
            </Link>
            <ChevronRight size={11} aria-hidden />
            <span>Workspace</span>
          </div>
          <h1 className="mt-1.5 flex items-center gap-2 font-display text-[30px] font-semibold tracking-[-0.035em]">
            <PointerHighlight
              rectangleClassName="border-accent/30"
              pointerClassName="text-accent"
            >
              <span className="px-0.5">{tool.h1}</span>
            </PointerHighlight>
            {tool.tier === "credits" && (
              <span title="Uses credits — sign in to run" className="mt-1">
                <Lock size={14} strokeWidth={1.8} className="text-faint" aria-hidden />
              </span>
            )}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{tool.tagline}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {tool.status === "soon" && <Badge tone="soon">UI preview</Badge>}
        {tool.tier === "free" ? (
          <Badge tone="free">Free</Badge>
        ) : (
          <Badge tone="credits">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {tool.creditCost} {tool.creditCost === 1 ? "credit" : "credits"}
          </Badge>
        )}
        <Badge tone="neutral">
          <EngineIcon size={11} aria-hidden />
          {tool.engine === "browser" ? "On-device" : "Cloud"}
        </Badge>
      </div>
    </header>
  );
}
