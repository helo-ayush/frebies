"use client";

import { memo } from "react";
import { adjOf, SHAPES, type ShapeDef, type ShapeGroup } from "./engine/shape-kinds";
import { toSvg } from "./engine/shapes";

const GROUPS: readonly ShapeGroup[] = ["Basic", "Arrows", "Flowchart", "Callouts", "Stars and banners", "Brackets"];
const ROOM = 24;

const ShapeIcon = memo(function ShapeIcon({ def }: { def: ShapeDef }) {
  const w = def.ratio >= 1 ? ROOM : ROOM * def.ratio;
  const h = def.ratio >= 1 ? ROOM / def.ratio : ROOM;
  return (
    <svg
      width={ROOM + 4}
      height={ROOM + 4}
      viewBox={`${-2 - (ROOM - w) / 2} ${-2 - (ROOM - h) / 2} ${ROOM + 4} ${ROOM + 4}`}
      className="overflow-visible"
      aria-hidden
    >
      {def.parts(w, h, adjOf(def)).map((part, i) => (
        <path
          key={i}
          d={toSvg(part.path)}
          fill={part.paint === "stroke" ? "none" : "currentColor"}
          fillOpacity={part.paint === "stroke" ? 0 : 0.12}
          fillRule={part.evenOdd ? "evenodd" : undefined}
          stroke={part.paint === "fill" ? "none" : "currentColor"}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
});

/** Every shape there is, to choose from. */
export function ShapeGrid({ onPick, active }: { onPick: (kind: string) => void; active?: string }) {
  return (
    <div>
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="sticky top-0 z-[1] border-y border-line bg-canvas px-3 py-1.5 text-[12px] uppercase text-muted first:border-t-0">
            {group}
          </p>
          <div className="grid grid-cols-8 p-1.5">
            {SHAPES.filter((def) => def.group === group).map((def) => (
              <button
                key={def.kind}
                type="button"
                title={def.label}
                aria-label={def.label}
                aria-pressed={active === def.kind}
                data-sound="select"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(def.kind)}
                className={`grid h-9 place-items-center ${active === def.kind ? "fb-ed-on" : "hover:bg-hover"}`}
              >
                <ShapeIcon def={def} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
