"use client";

import { Loader2 } from "lucide-react";
import { useStagePress } from "./AuthShell";

function GoogleGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden className="shrink-0">
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
  useStagePress(Boolean(loading));
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className="group flex h-[56px] w-full select-none items-stretch border border-line-strong bg-white text-[14.5px] font-semibold uppercase transition-colors hover:border-ink disabled:pointer-events-none disabled:opacity-55"
    >
      <span className="grid w-[56px] shrink-0 place-items-center border-r border-line-strong transition-colors group-hover:border-ink">
        {loading ? <Loader2 size={19} className="animate-spin" aria-hidden /> : <GoogleGlyph />}
      </span>
      <span className="flex flex-1 items-center px-5 text-left">{loading ? "Connecting to Google…" : label}</span>
    </button>
  );
}
