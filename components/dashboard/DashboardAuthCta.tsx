"use client";

import Link from "next/link";
import { HoverBorderLink } from "@/components/aceternity/hover-border-gradient";
import { useAuthSession } from "@/components/auth/AuthContext";
import { ArrowRightGlyph } from "@/components/icons/NavGlyph";

export function DashboardAuthCta() {
  const { isSignedIn, user } = useAuthSession();

  if (isSignedIn) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <HoverBorderLink
          href="/audio/text-to-speech"
          containerClassName="rounded-full"
          className="h-10 gap-2 rounded-full bg-white px-4 text-ui font-medium text-ink transition-colors hover:bg-[#f1efeb]"
        >
          Open AI studio
          <ArrowRightGlyph size={14} />
        </HoverBorderLink>
        <span className="text-[12.5px] text-white/70">
          Signed in as {user?.firstName ?? user?.email ?? "member"}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <HoverBorderLink
        href="/sign-up"
        containerClassName="rounded-full"
        className="h-10 gap-2 rounded-full bg-white px-4 text-ui font-medium text-ink transition-colors hover:bg-[#f1efeb]"
      >
        Claim 25 free credits
        <ArrowRightGlyph size={14} />
      </HoverBorderLink>
      <Link
        href="/sign-in"
        className="inline-flex h-10 items-center rounded-full border border-white/20 px-4 text-ui font-medium text-white/90 transition-colors hover:bg-white/10"
      >
        Sign in
      </Link>
    </div>
  );
}

