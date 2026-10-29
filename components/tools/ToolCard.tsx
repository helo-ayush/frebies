import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import type { Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";

const iconStyles = {
  image: "border-[#e8e3f3] bg-[#f6f3fb] text-[#65538c]",
  document: "border-[#e4e9f2] bg-[#f2f6fb] text-[#4c6584]",
  audio: "border-[#f3e5df] bg-[#fdf5f1] text-[#9a5943]",
};

export function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;

  return (
    <Link
      href={tool.path}
      className="group flex min-h-[196px] flex-col rounded-[14px] border border-line bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#d8d8d5] hover:shadow-[0_8px_24px_rgba(15,15,16,0.05)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid h-10 w-10 place-items-center rounded-[10px] border ${iconStyles[tool.category]}`}
        >
          <Icon size={19} strokeWidth={1.55} aria-hidden />
        </span>
        {tool.tier === "credits" ? (
          <Badge tone="credits">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {tool.creditCost} {tool.creditCost === 1 ? "credit" : "credits"}
          </Badge>
        ) : (
          <Badge tone="free">Free</Badge>
        )}
      </div>

      <div className="mt-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold tracking-[-0.01em] text-ink">
          {tool.name}
          {tool.tier === "credits" && (
            <span title="Uses credits — sign in to run">
              <Lock size={11} strokeWidth={2} className="text-faint" aria-hidden />
            </span>
          )}
        </p>
        <p className="mt-1.5 line-clamp-2 text-ui leading-[1.55] text-muted">{tool.description}</p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <span className="text-micro text-faint">
          {tool.status === "soon"
            ? "Interface preview"
            : tool.engine === "browser"
              ? "Runs on your device"
              : "Cloud processing"}
        </span>
        <span className="grid h-6 w-6 place-items-center rounded-full border border-line bg-white text-faint transition-all group-hover:border-ink group-hover:bg-ink group-hover:text-white">
          <ArrowUpRight size={12} aria-hidden />
        </span>
      </div>
    </Link>
  );
}
