import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import { WorkbenchPreview } from "@/components/landing/WorkbenchPreview";
import { Motion } from "@/components/ui";
import { Marquee, Showcase, Tools, Pricing, Privacy, CTA, Footer } from "@/components/Sections";

export default function Page() {
  return (
    <Motion>
      <main className="overflow-clip text-ink">
        <Navbar />
        <Hero />
        <WorkbenchPreview />
        <Marquee />
        <Showcase />
        <Tools />
        <Pricing />
        <Privacy />
        <CTA />
        <Footer />
      </main>
    </Motion>
  );
}
