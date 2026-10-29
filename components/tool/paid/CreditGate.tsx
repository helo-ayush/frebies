"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Mail, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

export function CreditGate({
  open,
  onClose,
  action,
  cost,
}: {
  open: boolean;
  onClose: () => void;
  action: string;
  cost: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setMessage(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  function comingSoon(method: string) {
    setMessage(
      `${method} sign-in is connected in the next build step. Your file and settings stay preserved in this browser.`,
    );
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="credit-gate-title"
      aria-describedby="credit-gate-description"
      className="fixed inset-0 m-auto h-fit max-h-[calc(100vh-32px)] w-[min(480px,calc(100vw-32px))] overflow-y-auto rounded-[16px] border border-line bg-white p-0 text-ink shadow-[0_30px_80px_rgba(15,15,16,0.28)]"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-10 w-10 place-items-center rounded-[11px] border border-line bg-rail text-ink">
            <Lock size={17} strokeWidth={1.7} aria-hidden />
          </span>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close dialog"
            className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/25"
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        <h2
          id="credit-gate-title"
          className="mt-4 font-display text-[24px] font-semibold leading-[1.12] tracking-[-0.03em]"
        >
          Sign in to {action}
        </h2>
        <p id="credit-gate-description" className="mt-2 text-ui leading-relaxed text-muted">
          Your file stays in this browser until you continue. New accounts get{" "}
          <span className="font-medium text-ink">25 free credits</span>.
        </p>

        <div className="mt-4 flex items-center justify-between rounded-[10px] border border-line bg-[#fbfaf7] px-3 py-2.5">
          <span className="text-[11px] text-muted">This run</span>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {cost} {cost === 1 ? "credit" : "credits"}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => comingSoon("Google")}
            className={buttonClasses("primary", "md", "w-full")}
          >
            <span className="grid h-4 w-4 place-items-center rounded-full bg-white text-[9px] font-bold text-ink">
              G
            </span>
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => comingSoon("Email")}
            className={buttonClasses("secondary", "md", "w-full")}
          >
            <Mail size={13} aria-hidden />
            Email me a 6-digit code
          </button>
        </div>

        {message && (
          <p
            role="status"
            className="mt-3 rounded-[9px] border border-[#eadfce] bg-[#fdf9f2] px-3 py-2 text-[10.5px] leading-relaxed text-[#786344]"
          >
            {message}
          </p>
        )}

        <p className="mt-4 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
          Cancel any time and the draft stays here for up to 60 minutes. No credits are
          used until the run starts.
        </p>
      </div>
    </dialog>
  );
}
