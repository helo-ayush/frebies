import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import { Motion } from "@/components/ui";
import { Marquee, Showcase, Tools, Pricing, Privacy, CTA, Footer } from "@/components/Sections";

export default function Page() {
  return (
    <Motion>
      <main>
        <Navbar />
        <Hero />
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
