import { HeroFigureMotion } from "./HeroFigureMotion";

export function HeroFigure({ svg }: { svg: string }) {
  return (
    <HeroFigureMotion>
      <div
        tabIndex={0}
        role="img"
        aria-label="Animated bench file press: three files ride a belt, get squeezed under a platen, and the dial confirms zero uploads. Use the arrow keys to step through the press."
        className="iso hero-figure"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </HeroFigureMotion>
  );
}
