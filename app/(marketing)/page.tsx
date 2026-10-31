import { readFileSync } from "node:fs";
import { join } from "node:path";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import { HeroFigure } from "@/components/hero/HeroFigure";
import { SiteProgressiveBlur } from "@/components/effects/SiteProgressiveBlur";
import { ScrollProgress } from "@/components/magicui/scroll-progress";
import { WorkbenchPreview } from "@/components/landing/WorkbenchPreview";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Motion } from "@/components/ui";
import { Marquee, Showcase, Tools, Pricing, Privacy, CTA, Footer } from "@/components/Sections";

const heroFigure = readFileSync(join(process.cwd(), "public", "hero-figure.svg"), "utf8");

export default function Page() {
  return (
    <Motion>
      <main className="overflow-clip text-ink">
        <ScrollProgress />
        <Hero figure={<HeroFigure svg={heroFigure} />} />
        <WorkbenchPreview />
        <Marquee />
        <HowItWorks />
        <Showcase />
        <Tools />
        <Pricing />
        <Privacy />
        <CTA />
        <Footer />
        <SiteProgressiveBlur />
      </main>
    </Motion>
  );
}
