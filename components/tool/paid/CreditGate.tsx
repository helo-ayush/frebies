"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useAuthSession } from "@/components/auth/AuthContext";
import { LockGlyph } from "@/components/icons/NavGlyph";
import { Arrow } from "@/components/site/kit";
import { buttonClasses } from "@/components/ui/Button";
import { canHoldFile, holdFile } from "@/lib/held-file";

/** Asked once, when a guest presses run on a tool that uses credits. */
export function CreditGate({
  open,
  onClose,
  action,
  cost,
  file,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  action: string;
  cost: number;
  /** What is loaded now. Held on this device while they sign in. */
  file?: File | null;
  settings?: unknown;
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

  const holding = useRef({ file, settings });
  holding.current = { file, settings };
  useEffect(() => {
    if (open && holding.current.file) void holdFile(pathname, holding.current.file, holding.current.settings);
  }, [open, pathname]);

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
      className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh-32px)] w-[min(500px,calc(100vw-32px))] overflow-y-auto border-0 bg-panel p-0 text-ink shadow-pop"
    >
      <div className="flex h-14 items-stretch justify-between bg-ink text-white">
        <span className="grid w-14 place-items-center bg-accent-deep">
          <LockGlyph size={19} />
        </span>
        <span className="fb-num flex flex-1 items-center px-4 text-[13px] uppercase text-white/70">
          This run // {cost} {cost === 1 ? "credit" : "credits"}
        </span>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close dialog"
          data-slot="dialog-close"
          className="grid w-14 place-items-center transition-colors hover:bg-white hover:text-ink"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="p-6 sm:p-8">
        <h2 id="credit-gate-title" className="fb-wide text-[clamp(25px,5vw,34px)]">
          Sign in to {action}
        </h2>
        <p id="credit-gate-description" className="mt-4 text-[15.5px] leading-[1.5] text-muted">
          New accounts get <span className="font-semibold text-ink">25 free credits</span>. No credits are
          used until the run starts.
        </p>

        <div className="mt-7 space-y-2.5">
          <Link href={`/sign-up${redirectQuery}`} className="fb-run">
            <span className="fb-run-icon">
              <Arrow size={18} />
            </span>
            <span className="fb-run-label">Create a free account</span>
          </Link>
          <Link href={`/sign-in${redirectQuery}`} className={buttonClasses("secondary", "lg", "w-full")}>
            I have an account
          </Link>
        </div>

        <p className="mt-5 text-[13px] leading-relaxed text-faint">
          {file && canHoldFile(file)
            ? "Your file and settings wait in this browser while you sign in, for up to 60 minutes."
            : "You come straight back to this tool."}
        </p>
      </div>
    </dialog>
  );
}
