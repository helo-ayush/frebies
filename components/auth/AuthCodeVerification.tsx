"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, MailCheck, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { GlossySubmitButton } from "./GlossySubmitButton";

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

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

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
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-start gap-3 rounded-[14px] border border-white/80 bg-white/70 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_4px_14px_-8px_rgba(15,15,16,0.08)] backdrop-blur-md">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#fff5ea] to-[#ffe4cc] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-accent/20">
          <MailCheck size={15} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-ink">{title}</p>
          <p className="mt-0.5 truncate text-[12px] text-muted">{email}</p>
        </div>
        <button
          type="button"
          onClick={onChangeEmail}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <ArrowLeft size={12} aria-hidden />
          Edit
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="block text-[12px] font-medium text-ink">6-digit verification code</span>
          <span className="text-[11px] text-faint">Paste or type</span>
        </div>

        <div className="grid grid-cols-6 gap-2" role="group" aria-label="6-digit verification code">
          {digits.map((digit, index) => (
            <motion.div
              key={index}
              animate={digit ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ duration: 0.16 }}
            >
              <input
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
                className={`h-12 w-full rounded-[12px] border text-center font-mono text-[18px] font-semibold transition-all duration-150 outline-none ${
                  digit
                    ? "border-[#d8c4b4] bg-white text-ink shadow-[inset_0_1px_0_rgba(255,255,255,1),0_6px_16px_-8px_rgba(229,94,64,0.28)]"
                    : "border-line/90 bg-white/75 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] hover:-translate-y-0.5 hover:border-[#d8c4b4] hover:bg-white/95 hover:shadow-[0_8px_18px_-8px_rgba(15,15,16,0.16)]"
                } focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20`}
              />
            </motion.div>
          ))}
        </div>
      </div>

      <GlossySubmitButton
        label={submitLabel}
        busyLabel="Verifying code…"
        busy={busy}
        disabled={code.length < OTP_LENGTH}
        icon={<ShieldCheck size={15} aria-hidden />}
      />

      <div className="flex items-center justify-between pt-0.5 text-[12px]">
        <span className="text-muted">Didn&apos;t receive the email?</span>
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending || busy}
          className="font-medium text-ink transition-colors hover:text-accent disabled:cursor-not-allowed disabled:text-faint"
        >
          {resending
            ? "Sending…"
            : cooldown > 0
              ? `Resend in ${cooldown}s`
              : "Resend code"}
        </button>
      </div>
    </form>
  );
}
