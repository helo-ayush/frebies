"use client";

import { useEffect, useMemo, useState } from "react";
import type { Cmd } from "../engine/shapes";
import { rectPath, toSvg } from "../engine/shapes";
import { loadFaces } from "../engine/fonts";
import { measureBox } from "../engine/text-dom";
import { DEFAULT_STYLE, marginBox, uid, type EditObject, type PathObject, type TextObject } from "../model";
import { addWords } from "../stamps";
import type { EditorStore } from "../store";
import { ColorPick } from "../ui";
import { Choice, Part, Sheet } from "./Sheet";

type Place = () => { page: string; x: number; y: number } | null;

// ---------------------------------------------------------------- symbols

const SYMBOLS: { title: string; signs: string }[] = [
  { title: "Ticks and bullets", signs: "✓ ✔ ✗ ✘ ☐ ☑ ☒ • ◦ ▪ ▫ ■ □ ● ○ ◆ ◇ ★ ☆ ➤ ▶ ◀ ▲ ▼" },
  { title: "Arrows", signs: "← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙ ⇐ ⇑ ⇒ ⇓ ⇔ ↩ ↪ ➔" },
  { title: "Maths", signs: "± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ ∏ ∫ ∂ ∆ ∇ ∈ ∉ ∪ ∩ ⊂ ⊃ ∀ ∃ ∴ ∵ ∠ ⊥ ∥ ° ′ ″ ‰" },
  { title: "Money", signs: "₹ $ € £ ¥ ¢ ₩ ₽ ₿ ฿ ₫ ₱ ƒ" },
  { title: "Fractions and powers", signs: "½ ⅓ ⅔ ¼ ¾ ⅕ ⅖ ⅗ ⅘ ⅙ ⅛ ⅜ ⅝ ⅞ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁰ ₀ ₁ ₂ ₃ ₄" },
  { title: "Greek", signs: "α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω" },
  { title: "Signs", signs: "© ® ™ § ¶ † ‡ № & @ # … – — « » “ ” ‘ ’ ¡ ¿ ♠ ♣ ♥ ♦ ☎ ✉ ☀ ☁ ☂ ♫ ⚠ ♻" },
];
const RECENT = "frebies:pdf-symbols";

export function SymbolsDialog({
  store,
  open,
  onClose,
  place,
}: {
  store: EditorStore;
  open: boolean;
  onClose: () => void;
  place: Place;
}) {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    try {
      const list = JSON.parse(window.localStorage.getItem(RECENT) ?? "[]") as string[];
      setRecent(Array.isArray(list) ? list.slice(0, 16) : []);
    } catch {
      setRecent([]);
    }
  }, [open]);
  const put = (sign: string) => {
    const list = [sign, ...recent.filter((item) => item !== sign)].slice(0, 16);
    try {
      window.localStorage.setItem(RECENT, JSON.stringify(list));
    } catch {
      // Not kept then.
    }
    addWords(store, sign, place());
    onClose();
  };
  const grid = (signs: string[]) => (
    <div className="grid grid-cols-8 gap-1 sm:grid-cols-12">
      {signs.map((sign) => (
        <button
          key={sign}
          type="button"
          onClick={() => put(sign)}
          className="grid h-10 place-items-center border border-line bg-white text-[19px] hover:border-ink hover:bg-ink hover:text-white"
          style={{ fontFamily: '"fb-arimo", "fb-symbols", system-ui, sans-serif' }}
        >
          {sign}
        </button>
      ))}
    </div>
  );
  return (
    <Sheet title="Symbols" open={open} onClose={onClose} width={640}>
      {recent.length > 0 ? <Part title="Used lately">{grid(recent)}</Part> : null}
      {SYMBOLS.map(({ title, signs }) => (
        <Part key={title} title={title}>
          {grid(signs.split(" "))}
        </Part>
      ))}
    </Sheet>
  );
}

// ---------------------------------------------------------------- codes

/** Squares of a code as one path in fractions of its box, runs joined. */
function squaresPath(rows: boolean[][]): Cmd[] {
  const h = rows.length;
  const w = rows[0]?.length ?? 1;
  const out: Cmd[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x += 1) {
      if (!row[x]) continue;
      let to = x;
      while (to < w && row[to]) to += 1;
      out.push(...rectPath(x / w, y / h, (to - x) / w, 1 / h));
      x = to;
    }
  });
  return out;
}

function barsPath(bars: boolean[]): Cmd[] {
  return squaresPath([bars]);
}

const pathObject = (path: Cmd[], color: string, x: number, y: number, w: number, h: number): PathObject => ({
  id: uid("v"),
  type: "path",
  x,
  y,
  w,
  h,
  angle: 0,
  opacity: 1,
  path,
  stroke: null,
  fill: color,
  width: 0,
  dash: [],
  cap: 0,
  join: 0,
});

type Made = { path: Cmd[]; ratio: number; text: string | null } | { problem: string };

export function CodeDialog({
  store,
  kind,
  open,
  onClose,
  place,
}: {
  store: EditorStore;
  kind: "qr" | "barcode";
  open: boolean;
  onClose: () => void;
  place: Place;
}) {
  const [text, setText] = useState("");
  const [level, setLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const [type, setType] = useState<"code128" | "ean13">("code128");
  const [color, setColor] = useState("#000000");
  const [made, setMade] = useState<Made | null>(null);

  useEffect(() => {
    if (!open || text.trim() === "") {
      setMade(null);
      return;
    }
    let off = false;
    void import("../engine/qr").then(({ qrCode, code128, ean13 }) => {
      if (off) return;
      try {
        if (kind === "qr") setMade({ path: squaresPath(qrCode(text.trim(), level)), ratio: 1, text: null });
        else if (type === "ean13") {
          const { bars, text: digits } = ean13(text);
          setMade({ path: barsPath(bars), ratio: 1.9, text: digits });
        } else {
          const widths = code128(text.trim());
          const bars = widths.flatMap((width, i) => Array.from({ length: width }, () => i % 2 === 0));
          setMade({ path: barsPath(bars), ratio: Math.max(1.6, bars.length / 42), text: text.trim() });
        }
      } catch (error) {
        setMade({ problem: error instanceof Error ? error.message : "That cannot be put in a code." });
      }
    });
    return () => {
      off = true;
    };
  }, [open, kind, text, level, type]);

  const good = made && "path" in made ? made : null;
  const shown = useMemo(
    () =>
      good
        ? toSvg(
            good.path.map((cmd): Cmd =>
              cmd[0] === "Z" ? cmd : cmd[0] === "C" ? cmd : [cmd[0], cmd[1] * 300, cmd[2] * (300 / good.ratio)],
            ),
          )
        : "",
    [good],
  );

  const put = () => {
    const at = place();
    const page = (at && store.page(at.page)) || store.here;
    if (!good || !page) return;
    const box = marginBox(page);
    const w = kind === "qr" ? Math.min(120, box.w * 0.4) : Math.min(190, box.w * 0.6);
    const h = w / good.ratio;
    const x = Math.max(box.x, Math.min(box.x + box.w - w, (at?.x ?? box.x + box.w / 2) - w / 2));
    const y = Math.max(box.y, Math.min(box.y + box.h - h, (at?.y ?? box.y + box.h / 3) - h / 2));
    const code = pathObject(good.path, color, x, y, w, h);
    const objects: EditObject[] = [code];
    const finish = () => {
      store.paste(page.id, objects, 0);
      store.setView({ tool: "select" });
      onClose();
    };
    if (!good.text) {
      finish();
      return;
    }
    const style = { ...DEFAULT_STYLE, size: 10, tracking: 1, color };
    const label = good.text;
    void loadFaces([style], label).then(() => {
      const size = measureBox({ runs: [{ text: label, style }], align: "center", leading: 13, wrap: false, w: 0 });
      const group = uid("g");
      code.group = group;
      const words: TextObject = {
        id: uid("t"),
        type: "text",
        x: x + (w - size.w) / 2,
        y: y + h + 2,
        w: size.w,
        h: 13,
        angle: 0,
        opacity: 1,
        runs: [{ text: label, style }],
        align: "center",
        leading: 13,
        wrap: false,
        group,
      };
      objects.push(words);
      finish();
    });
  };

  return (
    <Sheet
      title={kind === "qr" ? "QR code" : "Barcode"}
      open={open}
      onClose={onClose}
      width={520}
      foot={
        <button type="button" disabled={!good} onClick={put} className="fb-btn w-full">
          Put it on the page
        </button>
      }
    >
      <Part title={kind === "qr" ? "A link, or any text" : "What it holds"}>
        {kind === "qr" ? (
          <textarea
            value={text}
            rows={2}
            maxLength={2000}
            placeholder="https://example.com"
            aria-label="What the code holds"
            onChange={(event) => setText(event.target.value)}
            className="fb-input !min-h-[64px]"
          />
        ) : (
          <>
            <Choice
              label="Kind of barcode"
              value={type}
              onChange={setType}
              options={[
                { value: "code128", label: "Letters and digits" },
                { value: "ean13", label: "Product number (EAN-13)" },
              ]}
            />
            <input
              value={text}
              maxLength={80}
              inputMode={type === "ean13" ? "numeric" : "text"}
              placeholder={type === "ean13" ? "590123412345" : "ABC-12345"}
              aria-label="What the barcode holds"
              onChange={(event) => setText(event.target.value)}
              className="fb-input mt-3 !h-11"
            />
          </>
        )}
        {made && "problem" in made ? <p className="mt-2 text-[13.5px] text-danger">{made.problem}</p> : null}
      </Part>
      <Part className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-2 text-[13.5px]">
          Colour
          <ColorPick label="Colour of the code" value={color} onChange={setColor} />
        </span>
        {kind === "qr" ? (
          <label className="flex items-center gap-2 text-[13.5px]">
            Still reads when damaged
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value as typeof level)}
              className="fb-input !h-9 !w-[104px] !px-2.5 !text-[13.5px]"
            >
              <option value="L">A little</option>
              <option value="M">Some</option>
              <option value="Q">A lot</option>
              <option value="H">The most</option>
            </select>
          </label>
        ) : null}
      </Part>
      <div className="grid h-[210px] place-items-center bg-canvas">
        {good ? (
          <span className="block bg-white p-4">
            <svg
              width={kind === "qr" ? 150 : 250}
              height={kind === "qr" ? 150 : 250 / good.ratio}
              viewBox={`0 0 300 ${300 / good.ratio}`}
              role="img"
              aria-label="The code"
              shapeRendering="crispEdges"
            >
              <path d={shown} fill={color} />
            </svg>
            {good.text ? <span className="fb-num mt-1 block text-center text-[12px]">{good.text}</span> : null}
          </span>
        ) : (
          <span className="text-[14px] text-faint">It shows up here</span>
        )}
      </div>
    </Sheet>
  );
}
