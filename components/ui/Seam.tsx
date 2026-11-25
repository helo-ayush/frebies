import type { Tool } from "@/lib/registry/tools";

/**
 * The seam code from the landing page's blocks: coral is free, ink uses AI
 * credits, grey is a preview that does not run yet. Used wherever a tool is listed.
 */
export function seamColor(tool: Pick<Tool, "tier" | "status">): string {
  if (tool.status === "soon") return "#a5a4a2";
  return tool.tier === "free" ? "var(--fb-coral)" : "var(--fb-ink)";
}

export function seamLabel(tool: Pick<Tool, "tier" | "status" | "creditCost">): string {
  if (tool.status === "soon") return "Preview";
  if (tool.tier === "free") return "Free";
  return `${tool.creditCost ?? 1} ${tool.creditCost === 1 ? "credit" : "credits"}`;
}

export function Seam({ tool, className = "" }: { tool: Pick<Tool, "tier" | "status">; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[6px] w-5 shrink-0 ${className}`}
      style={{ background: seamColor(tool) }}
    />
  );
}

/** Seam plus its word. */
export function SeamTag({
  tool,
  className = "",
}: {
  tool: Pick<Tool, "tier" | "status" | "creditCost">;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 text-[12.5px] uppercase leading-none text-muted ${className}`}>
      <Seam tool={tool} />
      {seamLabel(tool)}
    </span>
  );
}
