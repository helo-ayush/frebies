import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInClient } from "@/components/auth/SignInClient";

export const metadata: Metadata = {
  title: "Sign in · frebies",
  description: "Sign in to your frebies account to access AI credits and your saved generation library.",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
      <SignInClient />
    </Suspense>
  );
}

