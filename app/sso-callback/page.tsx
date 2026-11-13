import type { Metadata } from "next";
import { Suspense } from "react";
import { SsoCallbackClient } from "@/components/auth/SsoCallbackClient";

export const metadata: Metadata = {
  title: "Signing you in · frebies",
  robots: { index: false, follow: false },
};

export default function SsoCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fcfcfb]" />}>
      <SsoCallbackClient />
    </Suspense>
  );
}

