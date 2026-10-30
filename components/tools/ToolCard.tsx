import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import type { Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { BorderBeam } from "@/components/magicui/border-beam";

function AccessBadge({ tool }: { tool: Tool }) {
  if (tool.status === "soon") {
    return <Badge tone="soon">Soon</Badge>;
  }
  return tool.tier === "credits" ? (
    <Badge tone="credits">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      {tool.creditCost} {tool.creditCost === 1 ? "credit" : "credits"}
    </Badge>
  ) : (
    <Badge tone="free">Free</Badge>
  );
}

function LockMark({ tool }: { tool: Tool }) {
  if (tool.tier !== "credits") return null;
  return (
    <span title="Uses credits — sign in to run">
      <Lock size={11} strokeWidth={2} className="text-faint" aria-hidden />
    </span>
  );
}

/** Grid view: flat card, no lift, no tinted tiles. */
export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link
      href={tool.path}
      className="group relative flex min-h-[176px] flex-col overflow-hidden rounded-xl border border-line bg-white p-4 transition-colors hover:bg-rail"
    >
      <BorderBeam
        size={90}
        duration={7}
        radius={12}
        colorFrom="#e55e40"
        colorTo="#fda82b"
        className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
          <ToolGlyph path={tool.path} size={18} />
        </span>
        <AccessBadge tool={tool} />
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[14px] font-medium text-ink">
        {tool.name}
        <LockMark tool={tool} />
      </p>
      <p className="mt-1 line-clamp-2 text-ui leading-[1.55] text-muted">{tool.description}</p>

      <p className="mt-auto pt-4 text-micro text-faint">
        {tool.status === "soon"
          ? "Coming soon"
          : tool.engine === "browser"
            ? "Runs on your device"
            : "Cloud processing"}
      </p>
    </Link>
  );
}

/** List view: one hairline row per tool, like a table. */
export function ToolRow({ tool }: { tool: Tool }) {
  return (
    <Link
      href={tool.path}
      className="group grid grid-cols-[minmax(0,1fr)_16px] items-center gap-4 px-4 py-3.5 transition-colors hover:bg-rail sm:grid-cols-[minmax(0,1fr)_110px_120px_16px]"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex shrink-0 text-muted transition-colors group-hover:text-ink">
          <ToolGlyph path={tool.path} size={19} />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[13.5px] font-medium text-ink">
            {tool.name}
            <LockMark tool={tool} />
          </p>
          <p className="mt-0.5 truncate text-micro text-faint">{tool.description}</p>
        </div>
      </div>
      <span className="hidden text-ui capitalize text-muted sm:block">{tool.category}</span>
      <span className="hidden sm:block">
        <AccessBadge tool={tool} />
      </span>
      <ChevronRight size={14} className="text-faint transition-colors group-hover:text-ink" aria-hidden />
    </Link>
  );
}
