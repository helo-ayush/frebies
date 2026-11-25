"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eraser, Trash2, Upload, X } from "lucide-react";
import { ToolTabs } from "@/components/tool/kit";
import { inkPath, strokePath, toSvg } from "./engine/shapes";
import { faceCss, faceOf, registerLibrary } from "./engine/fonts";
import { DEFAULT_STYLE, uid, type InkObject, type TextObject } from "./model";
import type { EditorStore } from "./store";

/** A signature, kept in this browser only. */
type Saved =
  | { id: string; kind: "ink"; strokes: number[][]; w: number; h: number; color: string }
  | { id: string; kind: "type"; text: string; font: string; color: string }
  | { id: string; kind: "image"; url: string };

const KEY = "frebies:signatures";
const FONTS = ["lib:vibes", "lib:dancing", "lib:caveat"];
const COLORS = ["#1d1c1f", "#1e3a8a", "#d8431b"];

function readSaved(): Saved[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as Saved[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeSaved(list: Saved[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Full or blocked: the signature still works this once.
  }
}

const fontCss = (id: string) => {
  const face = faceCss(faceOf({ ...DEFAULT_STYLE, font: id }));
  return { fontFamily: face.family, fontWeight: face.weight };
};

/** Takes the paper away from a photographed signature. */
async function cutPaper(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No canvas");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;
  let clear = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) clear = true;
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  if (!clear) {
    // Paper is the brightest common tone; anything near it goes.
    const tones = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4)
      tones[Math.round(data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11)] += 1;
    let paper = 255;
    let best = 0;
    for (let i = 120; i < 256; i += 1) if (tones[i] > best) [best, paper] = [tones[i], i];
    const from = paper - 60;
    for (let i = 0; i < data.length; i += 4) {
      const tone = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      data[i + 3] = Math.round(255 * Math.min(1, Math.max(0, (paper - 16 - tone) / Math.max(1, paper - 16 - from))));
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 40) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 <= x0 || y1 <= y0) throw new Error("Empty");
  context.putImageData(image, 0, 0);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")?.drawImage(canvas, -x0, -y0);
  return out.toDataURL("image/png");
}

type Mode = "draw" | "type" | "upload";

export function SignDialog({
  store,
  open,
  onClose,
  place,
}: {
  store: EditorStore;
  open: boolean;
  onClose: () => void;
  place: () => { page: string; x: number; y: number } | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pad = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [saved, setSaved] = useState<Saved[]>([]);
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [text, setText] = useState("");
  const [font, setFont] = useState(FONTS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [image, setImage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      registerLibrary();
      setSaved(readSaved());
      setProblem(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function put(item: Saved) {
    const at = place();
    if (!at) return;
    if (item.kind === "ink") {
      const w = 170;
      const h = Math.max(10, (w * item.h) / Math.max(1, item.w));
      const ink: InkObject = {
        id: uid("k"),
        type: "ink",
        x: at.x - w / 2,
        y: at.y - h / 2,
        w,
        h,
        angle: 0,
        opacity: 1,
        strokes: item.strokes,
        stroke: item.color,
        width: 1.8,
        marker: false,
      };
      store.add(at.page, ink);
    } else if (item.kind === "type") {
      const size = 34;
      const object: TextObject = {
        id: uid("t"),
        type: "text",
        x: at.x - 80,
        y: at.y - 22,
        w: 160,
        h: size * 1.25,
        angle: 0,
        opacity: 1,
        runs: [{ text: item.text, style: { ...DEFAULT_STYLE, font: item.font, size, color: item.color } }],
        align: "left",
        leading: size * 1.25,
        wrap: false,
      };
      store.add(at.page, object);
    } else {
      void fetch(item.url)
        .then((response) => response.blob())
        .then((blob) => store.addImageFile(blob, at.page, { x: at.x, y: at.y }))
        .then((id) => {
          const object = id ? store.doc.objects[id] : null;
          if (object?.type === "image" && object.w > 190)
            store.patch(object.id, { w: 190, h: (object.h * 190) / object.w, x: at.x - 95 }, "drag:sign");
        })
        .catch(() => undefined);
    }
    store.setView({ tool: "select" });
    onClose();
  }

  function keep(item: Saved) {
    const list = [item, ...readSaved()].slice(0, 6);
    writeSaved(list);
    put(item);
  }

  function use() {
    if (mode === "draw") {
      const points = strokes.flatMap((stroke) => {
        const out: { x: number; y: number }[] = [];
        for (let i = 0; i < stroke.length; i += 2) out.push({ x: stroke[i], y: stroke[i + 1] });
        return out;
      });
      if (points.length < 2) return;
      const x0 = Math.min(...points.map((p) => p.x));
      const x1 = Math.max(...points.map((p) => p.x));
      const y0 = Math.min(...points.map((p) => p.y));
      const y1 = Math.max(...points.map((p) => p.y));
      const w = Math.max(1, x1 - x0);
      const h = Math.max(1, y1 - y0);
      keep({
        id: uid("s"),
        kind: "ink",
        w,
        h,
        color,
        strokes: strokes.map((stroke) =>
          stroke.map((v, i) => Math.round((i % 2 === 0 ? (v - x0) / w : (v - y0) / h) * 10000) / 10000),
        ),
      });
      setStrokes([]);
    } else if (mode === "type") {
      if (text.trim() !== "") keep({ id: uid("s"), kind: "type", text: text.trim(), font, color });
    } else if (image) {
      keep({ id: uid("s"), kind: "image", url: image });
      setImage(null);
    }
  }

  const draw = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const svg = event.currentTarget;
    svg.setPointerCapture(event.pointerId);
    const at = (e: { clientX: number; clientY: number }) => {
      const rect = svg.getBoundingClientRect();
      return [((e.clientX - rect.left) / rect.width) * 600, ((e.clientY - rect.top) / rect.height) * 220];
    };
    let line = at(event);
    setStrokes((list) => [...list, line]);
    const move = (e: PointerEvent) => {
      for (const part of e.getCoalescedEvents?.() ?? [e]) {
        const [x, y] = at(part);
        if (Math.hypot(x - line[line.length - 2], y - line[line.length - 1]) > 1.4) line = [...line, x, y];
      }
      const now = line;
      setStrokes((list) => [...list.slice(0, -1), now]);
    };
    const up = () => {
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
      svg.removeEventListener("pointercancel", up);
      if (line.length < 4) setStrokes((list) => [...list.slice(0, -1), [...line, line[0] + 0.5, line[1]]]);
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
  };

  const ready = mode === "draw" ? strokes.length > 0 : mode === "type" ? text.trim() !== "" : image !== null;

  return (
    <dialog
      ref={ref}
      aria-label="Add a signature"
      onClose={onClose}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto max-h-[calc(100dvh-24px)] w-[min(640px,calc(100vw-24px))] max-w-none overflow-y-auto border border-ink bg-panel p-0 text-ink"
    >
      {open ? (
        <div>
          <div className="flex h-[58px] items-stretch justify-between border-b border-line">
            <p className="fb-wide flex items-center px-5 text-[19px]">Sign</p>
            <button
              type="button"
              aria-label="Close"
              data-slot="viewer-close"
              onClick={() => ref.current?.close()}
              className="grid w-[58px] place-items-center border-l border-line hover:bg-ink hover:text-white"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          {saved.length > 0 ? (
            <div className="border-b border-line px-5 py-4">
              <p className="mb-2.5 text-[13px] text-muted">Yours, kept in this browser only</p>
              <ul className="flex flex-wrap gap-2.5">
                {saved.map((item) => (
                  <li key={item.id} className="relative">
                    <button
                      type="button"
                      aria-label="Use this signature"
                      onClick={() => put(item)}
                      className="grid h-[74px] w-[176px] place-items-center overflow-hidden border border-line-strong bg-white px-3 hover:border-ink"
                    >
                      <Preview item={item} />
                    </button>
                    <button
                      type="button"
                      aria-label="Forget this signature"
                      title="Forget this signature"
                      data-slot="signature-remove"
                      onClick={() => {
                        const list = saved.filter((other) => other.id !== item.id);
                        setSaved(list);
                        writeSaved(list);
                      }}
                      className="absolute right-0 top-0 grid h-7 w-7 place-items-center bg-panel text-muted hover:bg-danger hover:text-white"
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ToolTabs<Mode>
                label="How to sign"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "draw", label: "Draw" },
                  { value: "type", label: "Type" },
                  { value: "upload", label: "Photo" },
                ]}
              />
              {mode === "upload" ? null : (
                <div role="group" aria-label="Ink" className="flex gap-2">
                  {COLORS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-label={`Ink ${item}`}
                      aria-pressed={color === item}
                      onClick={() => setColor(item)}
                      className={`h-8 w-8 border-2 ${color === item ? "border-accent" : "border-transparent"}`}
                    >
                      <span className="block h-full w-full" style={{ background: item }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4">
              {mode === "draw" ? (
                <div className="relative border border-line-strong bg-white">
                  <svg
                    ref={pad}
                    viewBox="0 0 600 220"
                    onPointerDown={draw}
                    className="block w-full cursor-crosshair touch-none"
                    role="img"
                    aria-label="Draw your signature here"
                  >
                    <line x1="40" y1="168" x2="560" y2="168" stroke="#cfcfcb" strokeWidth="1" strokeDasharray="5 5" />
                    {strokes.map((stroke, i) => (
                      <path
                        key={i}
                        d={toSvg(strokePath(stroke, 1, 1))}
                        fill="none"
                        stroke={color}
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </svg>
                  {strokes.length > 0 ? (
                    <button
                      type="button"
                      data-slot="signature-clear"
                      onClick={() => setStrokes([])}
                      className="absolute right-0 top-0 flex h-9 items-center gap-2 bg-panel px-3 text-[13px] hover:bg-ink hover:text-white"
                    >
                      <Eraser size={15} aria-hidden />
                      Clear
                    </button>
                  ) : (
                    <span className="pointer-events-none absolute inset-0 grid place-items-center pb-6 text-[14.5px] text-faint">
                      Draw your name here
                    </span>
                  )}
                </div>
              ) : mode === "type" ? (
                <>
                  <input
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Type your name"
                    aria-label="Your name"
                    maxLength={60}
                    className="fb-input"
                  />
                  <div role="group" aria-label="Handwriting" className="mt-3 grid gap-2 sm:grid-cols-3">
                    {FONTS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={font === id}
                        onClick={() => setFont(id)}
                        className={`grid h-[84px] place-items-center overflow-hidden border bg-white px-3 ${font === id ? "border-ink shadow-[inset_0_-3px_0_#f2552c]" : "border-line-strong hover:border-ink"}`}
                      >
                        <span
                          className="max-w-full truncate text-[30px] leading-[1.4]"
                          style={{ ...fontCss(id), color }}
                        >
                          {text.trim() || "Your name"}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => file.current?.click()}
                    className="fb-checker grid h-[180px] w-full place-items-center border border-line-strong hover:border-ink"
                  >
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="Your signature" className="max-h-[160px] max-w-[92%] object-contain" />
                    ) : (
                      <span className="flex items-center gap-2.5 bg-panel px-4 py-2.5 text-[14.5px]">
                        <Upload size={17} aria-hidden />
                        Choose a photo of your signature
                      </span>
                    )}
                  </button>
                  <p className="mt-2 text-[13px] text-muted">The paper is taken away, so only the ink is left.</p>
                  <input
                    ref={file}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const picked = event.target.files?.[0];
                      event.target.value = "";
                      if (!picked) return;
                      setProblem(null);
                      void cutPaper(picked)
                        .then(setImage)
                        .catch(() => setProblem("No signature could be found in that picture."));
                    }}
                  />
                </>
              )}
              {problem ? (
                <p role="alert" className="mt-2 text-[13.5px] text-danger">
                  {problem}
                </p>
              ) : null}
            </div>

            <button type="button" disabled={!ready} onClick={use} className="fb-btn mt-5 w-full">
              Place it on the page
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

function Preview({ item }: { item: Saved }) {
  if (item.kind === "type") {
    return (
      <span
        className="max-w-full truncate text-[26px] leading-[1.5]"
        style={{ ...fontCss(item.font), color: item.color }}
      >
        {item.text}
      </span>
    );
  }
  if (item.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.url} alt="" className="max-h-[58px] max-w-full object-contain" />;
  }
  const w = 150;
  const h = (w * item.h) / Math.max(1, item.w);
  const fit = Math.min(1, 56 / Math.max(1, h));
  const ink = { strokes: item.strokes, w: w * fit, h: h * fit } as InkObject;
  return (
    <svg width={w * fit} height={h * fit} className="overflow-visible" aria-hidden>
      <path
        d={toSvg(inkPath(ink))}
        fill="none"
        stroke={item.color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
