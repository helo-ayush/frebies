"use client";

import { Loader2 } from "lucide-react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";

function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.46 1.15-4.05 1.15-3.11 0-5.75-2.1-6.69-4.93H1.3v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.31 14.31A7.18 7.18 0 0 1 4.94 12c0-.8.14-1.58.37-2.31V6.6H1.3A12 12 0 0 0 0 12c0 1.94.46 3.77 1.3 5.4l4.01-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.3 6.6l4.01 3.09C6.25 6.85 8.89 4.75 12 4.75z"
      />
    </svg>
  );
}

export function GoogleOAuthButton({
  label,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);

  const highlight = useMotionTemplate`radial-gradient(150px circle at ${mouseX}px ${mouseY}px, rgba(255, 198, 150, 0.28), rgba(255, 255, 255, 0) 70%)`;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set(e.clientX - rect.left);
        mouseY.set(e.clientY - rect.top);
      }}
      onMouseLeave={() => {
        mouseX.set(-200);
        mouseY.set(-200);
      }}
      className="group relative flex h-11 w-full select-none items-center justify-center gap-2.5 overflow-hidden rounded-[12px] border border-white/90 bg-white/85 px-4 text-[13.5px] font-medium text-ink shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_16px_-6px_rgba(15,15,16,0.12),0_0_0_1px_rgba(15,15,16,0.06)] backdrop-blur-md transition-all duration-200 hover:border-white hover:bg-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_10px_24px_-8px_rgba(229,94,64,0.24),0_0_0_1px_rgba(229,94,64,0.14)] disabled:pointer-events-none disabled:opacity-55"
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: highlight }}
      />
      <span className="relative z-10 inline-flex items-center gap-2.5">
        {loading ? (
          <Loader2 size={15} className="animate-spin text-muted" aria-hidden />
        ) : (
          <span className="inline-flex transition-transform duration-200 group-hover:scale-110">
            <GoogleGlyph />
          </span>
        )}
        <span>{loading ? "Connecting to Google…" : label}</span>
      </span>
    </motion.button>
  );
}
