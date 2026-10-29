import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-[#2a2a2b]",
  secondary: "border border-line bg-white text-ink hover:bg-hover",
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
    "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
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
