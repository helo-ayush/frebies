"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { motion } from "motion/react";

export function GlossySubmitButton({
  label,
  busyLabel,
  busy,
  disabled,
  icon,
}: {
  label: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const isDisabled = Boolean(disabled || busy);

  return (
    <motion.button
      type="submit"
      disabled={isDisabled}
      whileHover={isDisabled ? undefined : { y: -1.5 }}
      whileTap={isDisabled ? undefined : { scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className="group/cta auth-glossy-cta relative inline-flex h-11 w-full select-none items-center justify-center gap-2 overflow-hidden rounded-[12px] px-4 text-[13.5px] font-medium text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {/* Top specular hairline */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent transition-opacity duration-200 group-hover/cta:via-white/65"
      />
      {/* Diagonal glass sheen sweep */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-y-4 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-all duration-700 group-hover/cta:left-[120%] group-hover/cta:opacity-100"
      />
      <span className="relative z-10 inline-flex items-center gap-2">
        {busy ? (
          <Loader2 size={15} className="animate-spin text-white/85" aria-hidden />
        ) : (
          <span className="inline-flex transition-transform duration-200 group-hover/cta:scale-110">
            {icon}
          </span>
        )}
        <span>{busy ? (busyLabel ?? label) : label}</span>
      </span>
    </motion.button>
  );
}
