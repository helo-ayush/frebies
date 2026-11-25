import { Motion } from "@/components/ui";
import { Closing, Footer, Questions } from "@/components/landing/site/Closing";
import { Hero } from "@/components/landing/site/Hero";
import { Journey } from "@/components/landing/site/Journey";
import { Nav } from "@/components/landing/site/Nav";
import { Pricing } from "@/components/landing/site/Pricing";
import { Toolbox } from "@/components/landing/site/Toolbox";

export default function Page() {
  return (
    <Motion>
      <Nav />
      <main>
        <Hero />
        <Toolbox />
        <Journey />
        <Pricing />
        <Questions />
        <Closing />
      </main>
      <Footer />
    </Motion>
  );
}
