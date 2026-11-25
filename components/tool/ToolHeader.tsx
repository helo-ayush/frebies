import { Cloud, MonitorSmartphone } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { ToolGlyph } from "@/components/icons/NavGlyph";

/**
 * Compact page header for a tool: one row, so the studio underneath starts
 * right below the topbar and the tool is usable without scrolling.
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
    <header className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] bg-ink text-white shadow-[0_10px_20px_-10px_rgba(15,15,16,0.55)]">
        <ToolGlyph path={tool.path} size={21} />
      </span>

      <div className="min-w-0 flex-1 basis-[240px]">
        <h1 className="font-display text-[22px] font-semibold leading-[1.15] tracking-[-0.03em] text-ink">
          {tool.h1}
        </h1>
        <p className="mt-0.5 text-[13.5px] leading-snug text-muted max-sm:line-clamp-2 sm:truncate">{tool.tagline}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {tool.status === "soon" && (
          <span className="inline-flex h-7 items-center rounded-full bg-[#fdf3e2] px-3 text-[12px] font-medium text-[#8a6320]">
            Preview
          </span>
        )}
        {showTierBadge &&
          (tool.tier === "free" ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-success-soft px-3 text-[12px] font-semibold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              Free
            </span>
          ) : (
            <span
              title="Uses credits. Sign in to run."
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-[12px] font-semibold text-accent-deep"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              {tool.creditCost} {tool.creditCost === 1 ? "credit" : "credits"}
            </span>
          ))}
        {showEngineBadge && (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[12px] font-medium text-muted">
            <EngineIcon size={13} aria-hidden />
            {onDevice ? "Runs on your device" : "Cloud"}
          </span>
        )}
      </div>
    </header>
  );
}
