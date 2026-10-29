import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const variants: Record<ButtonVariant, string> = {
  primary: [
    "text-white",
    "bg-[linear-gradient(180deg,#252525_0%,#101011_100%)]",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_1px_2px_rgba(15,15,16,0.16)]",
    "hover:bg-[linear-gradient(180deg,#2f2f2f_0%,#181819_100%)]",
  ].join(" "),
  secondary: [
    "border border-[#e4e4e0] text-ink",
    "bg-[linear-gradient(180deg,#ffffff_0%,#fafaf8_100%)]",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_1px_2px_rgba(15,15,16,0.035)]",
    "hover:border-[#d6d6d1] hover:bg-[linear-gradient(180deg,#ffffff_0%,#f4f4f1_100%)]",
  ].join(" "),
  ghost: "text-muted hover:bg-hover hover:text-ink",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-ui",
  md: "h-9 px-4 text-ui",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return [
    "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] font-medium transition-[background,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}
