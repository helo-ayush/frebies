"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Lock, UserPlus, X } from "lucide-react";
import { useAuthSession } from "@/components/auth/AuthContext";
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
  const pathname = usePathname();
  const { isSignedIn } = useAuthSession();

  const redirectQuery =
    pathname && pathname !== "/dashboard"
      ? `?redirect_url=${encodeURIComponent(pathname)}`
      : "";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (isSignedIn && ref.current?.open) {
      ref.current.close();
    }
  }, [isSignedIn]);

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

  return (
    <dialog
      ref={ref}
      aria-labelledby="credit-gate-title"
      aria-describedby="credit-gate-description"
      className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh-32px)] w-[min(460px,calc(100vw-32px))] overflow-y-auto rounded-[18px] border border-line bg-white p-0 text-ink shadow-pop"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-card text-ink">
            <Lock size={17} strokeWidth={1.7} aria-hidden />
          </span>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close dialog"
            data-slot="dialog-close"
            className="grid h-9 w-9 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        <h2
          id="credit-gate-title"
          className="mt-4 font-display text-[22px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[24px]"
        >
          Sign in to {action}
        </h2>
        <p id="credit-gate-description" className="mt-2 text-[14px] leading-relaxed text-muted">
          New accounts get <span className="font-medium text-ink">25 free credits</span>. No
          credits are used until the run starts.
        </p>

        <div className="mt-4 flex items-center justify-between rounded-[12px] bg-card px-3.5 py-3 text-[13px]">
          <span className="text-muted">This run</span>
          <span className="font-semibold tabular-nums text-ink">
            {cost} {cost === 1 ? "credit" : "credits"}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          <Link
            href={`/sign-up${redirectQuery}`}
            className={buttonClasses("accent", "lg", "w-full")}
          >
            <UserPlus size={15} aria-hidden />
            Create a free account
          </Link>
          <Link
            href={`/sign-in${redirectQuery}`}
            className={buttonClasses("secondary", "lg", "w-full")}
          >
            Sign in with Google or email
          </Link>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-faint">
          Close this any time: your draft stays here for up to 60 minutes.
        </p>
      </div>
    </dialog>
  );
}
