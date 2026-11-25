import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "success";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-[#2a2a2b]",
  secondary: "border border-line bg-white text-ink hover:bg-hover",
  ghost: "text-muted hover:bg-hover hover:text-ink",
  /** The one loud button on a tool page: run, convert, generate. */
  accent:
    "bg-[linear-gradient(180deg,#e9623f_0%,#cf4a2c_100%)] text-white shadow-cta hover:brightness-[1.06] active:brightness-95 disabled:bg-none disabled:bg-[#e9e6df] disabled:text-[#9a958b] disabled:shadow-none",
  /** Download / finished state. */
  success:
    "bg-[linear-gradient(180deg,#27906a_0%,#1f7a4d_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_24px_-10px_rgba(31,122,77,0.6)] hover:brightness-[1.06] active:brightness-95",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-ui rounded-[10px]",
  md: "h-9 px-4 text-ui rounded-[10px]",
  lg: "h-11 px-5 text-[14px] rounded-[12px]",
  xl: "h-12 px-6 text-[15px] rounded-[14px]",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  const loud = variant === "accent" || variant === "success";
  return [
    "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[background-color,filter,box-shadow,transform] duration-150 active:scale-[0.985] disabled:pointer-events-none",
    loud ? "font-semibold" : "disabled:opacity-50",
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
