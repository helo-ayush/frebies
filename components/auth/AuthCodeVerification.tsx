"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { AuthSubmit } from "./AuthSubmit";
import { useAuthStage } from "./AuthShell";

const OTP_LENGTH = 6;

export function AuthCodeVerification({
  email,
  title,
  submitLabel,
  code,
  onCodeChange,
  onSubmit,
  onResend,
  onChangeEmail,
  busy,
}: {
  email: string;
  title: string;
  submitLabel: string;
  code: string;
  onCodeChange: (next: string) => void;
  onSubmit: (e: FormEvent) => void;
  onResend: () => Promise<boolean>;
  onChangeEmail: () => void;
  busy?: boolean;
}) {
  const [cooldown, setCooldown] = useState(30);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const { show } = useAuthStage();

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  // The machine reads the code back as it is typed.
  useEffect(() => {
    show(["CODE", code.padEnd(OTP_LENGTH, "·")]);
  }, [code, show]);
  useEffect(() => () => show(null), [show]);

  // The sixth digit is the go-ahead: no button to reach for.
  const sentFor = useRef("");
  useEffect(() => {
    if (code.length !== OTP_LENGTH || busy || sentFor.current === code) return;
    sentFor.current = code;
    formRef.current?.requestSubmit();
  }, [code, busy]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const digits = Array.from({ length: OTP_LENGTH }, (_, idx) => code[idx] ?? "");

  function setDigit(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      const nextArr = [...digits];
      nextArr[index] = "";
      onCodeChange(nextArr.join(""));
      return;
    }

    // Handle multi-character autofill/paste into a single box
    if (cleaned.length > 1) {
      const next = (code.slice(0, index) + cleaned).slice(0, OTP_LENGTH);
      onCodeChange(next);
      const targetIdx = Math.min(OTP_LENGTH - 1, next.length);
      inputsRef.current[targetIdx]?.focus();
      return;
    }

    const nextArr = [...digits];
    nextArr[index] = cleaned;
    onCodeChange(nextArr.join(""));
    if (index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const nextArr = [...digits];
        nextArr[index] = "";
        onCodeChange(nextArr.join(""));
        e.preventDefault();
      } else if (index > 0) {
        const prevInput = inputsRef.current[index - 1];
        const nextArr = [...digits];
        nextArr[index - 1] = "";
        onCodeChange(nextArr.join(""));
        prevInput?.focus();
        e.preventDefault();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
      e.preventDefault();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    onCodeChange(pasted);
    const focusIdx = Math.min(OTP_LENGTH - 1, pasted.length);
    inputsRef.current[focusIdx]?.focus();
  }

  async function handleResend() {
    if (cooldown > 0 || resending || busy) return;
    setResending(true);
    try {
      const ok = await onResend();
      if (ok) setCooldown(30);
    } finally {
      setResending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
      <div className="flex items-stretch border border-line-strong bg-white">
        <div className="min-w-0 flex-1 px-4 py-3">
          <p className="text-[13px] text-muted">{title}</p>
          <p className="mt-0.5 truncate text-[15.5px] font-semibold">{email}</p>
        </div>
        <button
          type="button"
          onClick={onChangeEmail}
          className="shrink-0 border-l border-line-strong px-5 text-[13px] font-medium uppercase transition-colors hover:bg-ink hover:text-white"
        >
          Change
        </button>
      </div>

      <div role="group" aria-label="6-digit verification code" className="grid grid-cols-6">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
            maxLength={6}
            value={digit}
            onChange={(e) => setDigit(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            className={`fb-wide -ml-px h-[68px] w-full border text-center !text-[28px] outline-none transition-colors first:ml-0 focus:relative focus:z-[1] focus:border-ink focus:shadow-[inset_0_-4px_0_#f2552c] focus-visible:outline-none ${
              digit ? "border-line-strong bg-white" : "border-line-strong bg-canvas hover:bg-white"
            }`}
          />
        ))}
      </div>

      <AuthSubmit
        label={submitLabel}
        busyLabel="Checking the code…"
        busy={busy}
        disabled={code.length < OTP_LENGTH}
        icon={<ShieldCheck size={19} aria-hidden />}
      />

      <div className="flex items-center justify-between gap-4 text-[14px]">
        <span className="text-muted">No email yet?</span>
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending || busy}
          className="fb-num font-semibold underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent-deep disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
        >
          {resending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
