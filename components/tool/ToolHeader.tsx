import { Cloud, MonitorSmartphone } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { SeamTag } from "@/components/ui/Seam";

/**
 * One row between the top bar and the studio: what this tool is, and whether
 * it is free. The studio fills everything below it, so nothing needs scrolling.
 */
export function ToolHeader({
  tool,
  showTierBadge = true,
  showEngineBadge = true,
}: {
  tool: Tool;
  category?: Category;
  showTierBadge?: boolean;
  showEngineBadge?: boolean;
}) {
  const onDevice = tool.engine === "browser";
  const EngineIcon = onDevice ? MonitorSmartphone : Cloud;

  return (
    <header data-slot="tool-header" className="flex min-h-[var(--fb-head)] items-stretch border-b border-line">
      <span
        className="fb-ear hidden w-[var(--fb-head)] shrink-0 place-items-center bg-ink text-white sm:grid"
        style={{ ["--ear" as string]: "18px" }}
      >
        <ToolGlyph path={tool.path} size={27} />
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-8 gap-y-1 px-4 py-3 sm:px-5 lg:px-6">
        <div className="min-w-0">
          <h1 className="fb-wide text-[clamp(19px,1.75vw,26px)]">{tool.h1}</h1>
          <p className="mt-1.5 text-[14px] leading-snug text-muted max-sm:line-clamp-1 sm:truncate">{tool.tagline}</p>
        </div>

        <div className="hidden flex-wrap items-center gap-x-6 gap-y-1 md:flex">
          {(showTierBadge || tool.status === "soon") && <SeamTag tool={tool} />}
          {showEngineBadge && (
            <span className="inline-flex items-center gap-2 text-[12.5px] uppercase leading-none text-muted">
              <EngineIcon size={14} strokeWidth={1.7} aria-hidden />
              {onDevice ? "Runs in your browser" : "Runs on our server"}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
