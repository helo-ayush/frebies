import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ToolText } from "@/components/tool/kit";

const DOT = {
  ready: "bg-accent",
  booting: "fb-blink bg-accent",
  error: "bg-danger",
  asleep: "bg-faint",
} as const;

/** Last line of an AI studio's rail: is its server awake, and a key to wake it. */
export function EngineRow({
  state,
  label,
  actionLabel,
  onAction,
  busy = false,
  icon,
}: {
  state: keyof typeof DOT;
  label: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="-mx-4 mt-3 flex min-h-[60px] items-center justify-between gap-3 border-t border-line px-4 pt-3 text-[13.5px] text-muted sm:-mx-5 sm:px-5">
      <span role="status" className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 ${DOT[state]}`} />
        <span className="fb-num min-w-0">{label}</span>
      </span>
      {actionLabel && onAction ? (
        <ToolText
          onClick={onAction}
          disabled={busy}
          icon={busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : icon}
          className="shrink-0"
        >
          {actionLabel}
        </ToolText>
      ) : null}
    </div>
  );
}
