import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpClient } from "@/components/auth/SignUpClient";

export const metadata: Metadata = {
  title: "Create account · frebies",
  description: "Create a free frebies account and claim 25 AI credits for voice synthesis, OCR, and upscaling.",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
      <SignUpClient />
    </Suspense>
  );
}

