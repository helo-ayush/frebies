import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "success";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-accent-deep",
  secondary: "border border-line-strong bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-white",
  ghost: "text-muted hover:bg-hover hover:text-ink",
  /** Run something. */
  accent: "bg-accent-deep text-white hover:bg-ink disabled:bg-[#cbcac6] disabled:text-[#6f6e74]",
  /** Take the finished thing away. */
  success: "bg-ink text-white hover:bg-accent-deep",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-10 px-4 text-[13.5px]",
  lg: "h-12 px-5 text-[14px]",
  xl: "h-14 px-7 text-[14.5px]",
};

/** Flat block buttons. The loud run / download control is `.fb-run` in the tool kit. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return [
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold uppercase leading-none transition-colors duration-200 disabled:pointer-events-none",
    variant === "accent" ? "" : "disabled:opacity-45",
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
