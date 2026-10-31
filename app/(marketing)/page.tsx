import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import { SiteProgressiveBlur } from "@/components/effects/SiteProgressiveBlur";
import { ScrollProgress } from "@/components/magicui/scroll-progress";
import { WorkbenchPreview } from "@/components/landing/WorkbenchPreview";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Motion } from "@/components/ui";
import { Marquee, Showcase, Tools, Pricing, Privacy, CTA, Footer } from "@/components/Sections";

export default function Page() {
  return (
    <Motion>
      <main className="overflow-clip text-ink">
        <ScrollProgress />
        <Hero />
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
