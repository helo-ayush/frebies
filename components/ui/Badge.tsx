import type { ReactNode } from "react";

const tones = {
  free: "border border-line bg-white text-muted",
  credits: "border border-line bg-[#fcfcfb] text-ink",
  soon: "bg-card text-muted",
  neutral: "bg-card text-muted",
  dark: "bg-ink text-white",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium leading-none ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
