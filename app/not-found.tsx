import Link from "next/link";
import { ArrowLeft, ArrowRight, FileQuestion, Image as ImageIcon, FileText, AudioLines } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { EncryptedText } from "@/components/aceternity/encrypted-text";
import { HoverBorderLink } from "@/components/aceternity/hover-border-gradient";
import { Spotlight } from "@/components/aceternity/spotlight";
import { SquigglyText } from "@/components/aceternity/squiggly-text";
import { SiteProgressiveBlur } from "@/components/effects/SiteProgressiveBlur";
import { buttonClasses } from "@/components/ui/Button";

const destinations = [
  { href: "/image", label: "Image tools", icon: ImageIcon },
  { href: "/document", label: "Document tools", icon: FileText },
  { href: "/audio", label: "Audio tools", icon: AudioLines },
];

export default function NotFound() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white px-5 py-6 text-ink">
      <Spotlight fill="#ffd7a8" className="-top-[420px] left-1/2 z-0 -translate-x-1/2" />
      <Wordmark href="/" />
      <div className="mx-auto flex min-h-[calc(100vh-100px)] max-w-[920px] items-center justify-center py-12">
        <div className="w-full text-center">
          <div className="relative mx-auto h-36 w-52">
            <span aria-hidden className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff0d8_0%,#f5b784_45%,#d97555_100%)] opacity-65" />
            <span className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[20px] border border-line bg-white text-muted shadow-[0_12px_35px_rgba(15,15,16,0.08)]">
              <FileQuestion size={32} strokeWidth={1.25} aria-hidden />
            </span>
          </div>
          <p className="relative mt-4 text-micro font-medium uppercase tracking-[0.18em] text-faint">
            <EncryptedText
              text="404 · Wrong turn"
              revealDelayMs={58}
              encryptedClassName="text-accent/70"
            />
          </p>
          <h1 className="mt-3 font-display text-[36px] font-semibold tracking-[-0.04em]">
            <SquigglyText scale={[2, 3]} stepDuration={140}>
              This file is not here.
            </SquigglyText>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            The page may have moved or the link may be incomplete. The toolbox is right where you left it.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            <HoverBorderLink
              href="/dashboard"
              containerClassName="rounded-full"
              className="h-10 gap-2 rounded-full bg-ink px-4 text-ui text-white transition-colors hover:bg-neutral-800"
            >
              Open the toolbox <ArrowRight size={14} aria-hidden />
            </HoverBorderLink>
            <Link href="/" className={buttonClasses("secondary", "md", "h-10")}>
              <ArrowLeft size={14} aria-hidden /> Back home
            </Link>
          </div>
          <div className="mx-auto mt-12 grid max-w-[660px] gap-2 sm:grid-cols-3">
            {destinations.map((destination) => {
              const Icon = destination.icon;
              return (
                <Link key={destination.href} href={destination.href} className="group flex items-center gap-2.5 rounded-[11px] border border-line bg-white p-3 text-left hover:bg-rail">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-rail text-muted group-hover:bg-white"><Icon size={15} /></span>
                  <span className="text-ui font-medium">{destination.label}</span>
                  <ArrowRight size={12} className="ml-auto text-faint" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      <SiteProgressiveBlur />
    </main>
  );
}
