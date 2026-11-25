import { ScrollProgress } from "@/components/magicui/scroll-progress";
import { Motion } from "@/components/ui";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { ScrollStory } from "@/components/landing/ScrollStory";
import { FormatMarquee, ToolBento } from "@/components/landing/ToolBento";
import {
  FaqSection,
  FinalCta,
  LandingFooter,
  PricingSection,
  PrivacySection,
} from "@/components/landing/LandingClosing";

export default function Page() {
  return (
    <Motion>
      <ScrollProgress />
      <LandingNav />
      <main className="overflow-x-clip text-ink">
        <LandingHero />
        <FormatMarquee />
        <ScrollStory />
        <ToolBento />
        <PrivacySection />
        <PricingSection />
        <FaqSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </Motion>
  );
}
