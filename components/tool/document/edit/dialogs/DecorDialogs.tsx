"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import { FontPick } from "../TextBar";
import { ALL_PAGES, FRESH_DECOR, decorOf, decorStyles, filledIn, parsePages } from "../engine/decor";
import { loadFaces } from "../engine/fonts";
import { TextArt } from "../Art";
import { DEFAULT_STYLE, shownMatrix, shownSize, type Band, type Decor, type PageSet, type Style } from "../model";
import { useEditor, type EditorStore } from "../store";
import { ColorPick, NumberBox } from "../ui";
import { Choice, Part, Sheet, Tick } from "./Sheet";

const EMPTY: Band = { left: "", center: "", right: "" };
type Watermark = NonNullable<Decor["watermark"]>;

/** Which pages something goes on. */
function PagesFields({ value, count, onChange }: { value: PageSet; count: number; onChange: (set: PageSet) => void }) {
  return (
    <div>
      <Choice
        label="Which pages"
        value={value.kind}
        onChange={(kind) => onChange({ ...value, kind })}
        options={[
          { value: "all", label: "All pages" },
          { value: "odd", label: "Odd pages" },
          { value: "even", label: "Even pages" },
          { value: "list", label: "Some pages" },
        ]}
      />
      {value.kind === "list" ? (
        <input
          value={value.list}
          aria-label="Pages"
          placeholder={`1-3, 5, ${count}`}
          onChange={(event) => onChange({ ...value, list: event.target.value })}
          className="fb-input mt-2 !h-10 max-w-[260px]"
        />
      ) : null}
      <div className="mt-2">
        <Tick checked={value.skipFirst} onChange={(skipFirst) => onChange({ ...value, skipFirst })}>
          Not on the first page
        </Tick>
      </div>
    </div>
  );
}

/** The page being looked at with the new settings, small. */
function Preview({ store, decor, height = 250 }: { store: EditorStore; decor: Decor; height?: number }) {
  const page = useEditor(store, (s) => s.here);
  const pages = useEditor(store, (s) => s.doc.pages);
  const [tick, setTick] = useState(0);
  const fonts = decorStyles(decor)
    .map((style) => `${style.font}${style.bold}${style.italic}`)
    .join();
  useEffect(() => {
    let off = false;
    void loadFaces(decorStyles(decor)).then(() => !off && setTick((value) => value + 1));
    return () => {
      off = true;
    };
  }, [fonts]); // eslint-disable-line react-hooks/exhaustive-deps
  const index = Math.max(
    0,
    pages.findIndex((item) => item.id === page?.id),
  );
  const items = useMemo(
    () =>
      page
        ? decorOf({ ...store.doc, decor }, page, { index, count: pages.length, name: store.name }, store.assets)
        : [],
    [decor, page, index, pages.length, store, tick], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!page) return null;
  const size = shownSize(page);
  const k = Math.min(height / size.h, 230 / size.w);
  const m = shownMatrix(page).map((value) => value * k);
  const drawn = store.canvases.get(page.id)?.canvas;
  return (
    <div className="grid place-items-center bg-canvas p-4">
      <div
        className="relative overflow-hidden shadow-[0_0_0_1px_#a5a4a2]"
        style={{ width: size.w * k, height: size.h * k, background: page.paper ?? "#fff" }}
      >
        <div
          className="absolute left-0 top-0"
          style={{ width: page.w, height: page.h, transformOrigin: "0 0", transform: `matrix(${m.join(",")})` }}
        >
          {drawn ? <Copied canvas={drawn} w={page.w} h={page.h} /> : null}
          {items.map((item, i) => (
            <span
              key={i}
              className="absolute left-0 top-0 block"
              style={{
                transformOrigin: "0 0",
                transform: `translate(${item.x}px, ${item.y}px) rotate(${item.angle}deg)`,
                opacity: item.opacity,
              }}
            >
              {item.kind === "text" ? (
                <TextArt body={item.laid} wrap={item.laid.wrap} w={item.laid.w} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={store.assets.get(item.asset)?.url}
                  alt=""
                  className="block max-w-none"
                  style={{ width: item.w, height: item.h }}
                />
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Copied({ canvas, w, h }: { canvas: HTMLCanvasElement; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const scale = Math.min(1, 600 / canvas.width);
    node.width = Math.max(1, Math.round(canvas.width * scale));
    node.height = Math.max(1, Math.round(canvas.height * scale));
    node.getContext("2d")?.drawImage(canvas, 0, 0, node.width, node.height);
  }, [canvas]);
  return <canvas ref={ref} aria-hidden className="absolute left-0 top-0 block" style={{ width: w, height: h }} />;
}

function StyleFields({
  store,
  style,
  onChange,
  size = true,
}: {
  store: EditorStore;
  style: Style;
  onChange: (style: Style) => void;
  size?: boolean;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <FontPick store={store} value={style.font} onChange={(font) => onChange({ ...style, font })} />
      {size ? (
        <NumberBox
          label="Size"
          value={style.size}
          min={4}
          max={60}
          width={42}
          onChange={(value) => onChange({ ...style, size: value })}
        />
      ) : null}
      <ColorPick label="Colour" value={style.color} onChange={(color) => onChange({ ...style, color })} />
      <button
        type="button"
        aria-pressed={style.bold}
        onClick={() => onChange({ ...style, bold: !style.bold })}
        className={`h-9 w-9 border border-line-strong text-[14px] font-bold ${style.bold ? "fb-ed-on" : "bg-white hover:bg-hover"}`}
      >
        B
      </button>
      <button
        type="button"
        aria-pressed={style.italic}
        onClick={() => onChange({ ...style, italic: !style.italic })}
        className={`h-9 w-9 border border-line-strong text-[14px] italic ${style.italic ? "fb-ed-on" : "bg-white hover:bg-hover"}`}
      >
        I
      </button>
    </span>
  );
}

// ---------------------------------------------------------------- header, footer, page numbers

const NUMBERS = [
  "{page}",
  "Page {page}",
  "{page} of {pages}",
  "Page {page} of {pages}",
  "- {page} -",
  "{page}/{pages}",
];
const TOKENS: { token: string; label: string }[] = [
  { token: "{page}", label: "Page number" },
  { token: "{pages}", label: "Number of pages" },
  { token: "{date}", label: "Date" },
  { token: "{file}", label: "File name" },
];
type Spot = { band: "header" | "footer"; side: keyof Band };

export function BandsDialog({ store, open, onClose }: { store: EditorStore; open: boolean; onClose: () => void }) {
  const doc = useEditor(store, (s) => s.doc);
  const [decor, setDecor] = useState<Decor>(FRESH_DECOR);
  const [spot, setSpot] = useState<Spot>({ band: "footer", side: "center" });
  useEffect(() => {
    if (!open) return;
    const now = store.doc.decor ?? FRESH_DECOR;
    const bare = !now.header && !now.footer;
    setDecor(bare ? { ...now, footer: { ...EMPTY, center: "{page}" } } : now);
    setSpot({ band: "footer", side: "center" });
  }, [open, store]);
  const count = doc.pages.length;
  const words = (at: Spot) => decor[at.band]?.[at.side] ?? "";
  const write = (at: Spot, value: string) =>
    setDecor((now) => ({ ...now, [at.band]: { ...EMPTY, ...now[at.band], [at.side]: value } }));
  const shown = (text: string) => filledIn(text, decor, { index: 0, count, name: store.name });

  const cell = (at: Spot, label: string) => (
    <input
      key={`${at.band}-${at.side}`}
      value={words(at)}
      aria-label={label}
      placeholder={at.side === "left" ? "Left" : at.side === "center" ? "Centre" : "Right"}
      onFocus={() => setSpot(at)}
      onChange={(event) => write(at, event.target.value)}
      className={`fb-input !h-10 min-w-0 !px-2.5 !text-[13.5px] ${at.side === "center" ? "text-center" : at.side === "right" ? "text-right" : ""} ${
        spot.band === at.band && spot.side === at.side ? "!border-ink" : ""
      }`}
    />
  );
  const band = (name: "header" | "footer", title: string) => (
    <Part title={title}>
      <div className="grid grid-cols-3 gap-2">
        {cell({ band: name, side: "left" }, `${title}, left`)}
        {cell({ band: name, side: "center" }, `${title}, centre`)}
        {cell({ band: name, side: "right" }, `${title}, right`)}
      </div>
    </Part>
  );

  return (
    <Sheet
      title="Header and footer"
      open={open}
      onClose={onClose}
      width={860}
      foot={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={!doc.decor?.header && !doc.decor?.footer}
            onClick={() => {
              store.commit((now) => ({
                ...now,
                decor: now.decor ? { ...now.decor, header: undefined, footer: undefined } : undefined,
              }));
              onClose();
            }}
            className="h-[46px] px-4 text-[14px] font-medium hover:bg-danger hover:text-white disabled:pointer-events-none disabled:opacity-35"
          >
            Remove
          </button>
          <button
            type="button"
            onClick={() => {
              store.commit((now) => ({ ...now, decor: { ...decor, watermark: now.decor?.watermark } }));
              onClose();
            }}
            className="fb-btn min-w-[180px]"
          >
            Apply
          </button>
        </div>
      }
    >
      <div className="sm:grid sm:grid-cols-[minmax(0,1fr)_270px]">
        <div className="sm:border-r sm:border-line">
          {band("header", "Header")}
          {band("footer", "Footer")}
          <Part title="Put in the box you last clicked">
            <div className="flex flex-wrap gap-2">
              {NUMBERS.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => write(spot, text)}
                  className="fb-num h-9 border border-line-strong bg-white px-3 text-[13px] hover:border-ink"
                >
                  {shown(text)}
                </button>
              ))}
              {TOKENS.map(({ token, label }) => (
                <button
                  key={token}
                  type="button"
                  onClick={() =>
                    write(spot, `${words(spot)}${words(spot) && !words(spot).endsWith(" ") ? " " : ""}${token}`)
                  }
                  className="h-9 border border-dashed border-line-strong px-3 text-[13px] hover:border-ink"
                >
                  + {label}
                </button>
              ))}
            </div>
          </Part>
          <Part title="How it looks">
            <StyleFields
              store={store}
              style={decor.bandStyle}
              onChange={(bandStyle) => setDecor((now) => ({ ...now, bandStyle }))}
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[13px]">
              <label className="flex items-center gap-2">
                From the edge
                <NumberBox
                  label="From the edge"
                  value={decor.bandAt}
                  min={4}
                  max={200}
                  width={44}
                  suffix="pt"
                  onChange={(bandAt) => setDecor((now) => ({ ...now, bandAt }))}
                />
              </label>
              <label className="flex items-center gap-2">
                First number
                <NumberBox
                  label="First number"
                  value={decor.from}
                  min={0}
                  max={99999}
                  width={48}
                  onChange={(from) => setDecor((now) => ({ ...now, from: Math.round(from) }))}
                />
              </label>
              <label className="flex items-center gap-2">
                Digits
                <NumberBox
                  label="Digits"
                  value={decor.digits}
                  min={1}
                  max={8}
                  width={34}
                  onChange={(digits) => setDecor((now) => ({ ...now, digits: Math.round(digits) }))}
                />
              </label>
            </div>
          </Part>
          <Part title="Where">
            <PagesFields
              value={decor.bandPages}
              count={count}
              onChange={(bandPages) => setDecor((now) => ({ ...now, bandPages }))}
            />
          </Part>
        </div>
        <div className="hidden sm:block">{open ? <Preview store={store} decor={decor} height={320} /> : null}</div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- watermark

const FRESH_MARK: Watermark = {
  kind: "text",
  text: "CONFIDENTIAL",
  style: { ...DEFAULT_STYLE, bold: true, color: "#d8431b" },
  angle: -45,
  opacity: 0.18,
  size: 0.75,
  tile: false,
  place: "center",
  pages: ALL_PAGES,
};
const READY = ["CONFIDENTIAL", "DRAFT", "SAMPLE", "COPY", "DO NOT COPY", "FINAL", "URGENT"];

function Range({
  label,
  value,
  min,
  max,
  step,
  show,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  show: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[13px]">
      <span className="flex justify-between">
        {label}
        <span className="fb-num text-muted">{show}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="range mt-2 w-full"
        style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
    </label>
  );
}

export function WatermarkDialog({ store, open, onClose }: { store: EditorStore; open: boolean; onClose: () => void }) {
  const doc = useEditor(store, (s) => s.doc);
  const [mark, setMark] = useState<Watermark>(FRESH_MARK);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setMark(store.doc.decor?.watermark ?? FRESH_MARK);
  }, [open, store]);
  const set = (patch: Partial<Watermark>) => setMark((now) => ({ ...now, ...patch }));
  const decor: Decor = { ...(doc.decor ?? FRESH_DECOR), watermark: mark };
  const ready = mark.kind === "text" ? mark.text.trim() !== "" : Boolean(mark.asset);
  const section = (title: string, children: ReactNode) => <Part title={title}>{children}</Part>;
  return (
    <Sheet
      title="Watermark"
      open={open}
      onClose={onClose}
      width={820}
      foot={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={!doc.decor?.watermark}
            onClick={() => {
              store.commit((now) => ({
                ...now,
                decor: now.decor ? { ...now.decor, watermark: undefined } : undefined,
              }));
              onClose();
            }}
            className="h-[46px] px-4 text-[14px] font-medium hover:bg-danger hover:text-white disabled:pointer-events-none disabled:opacity-35"
          >
            Remove
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              store.commit((now) => ({ ...now, decor: { ...(now.decor ?? FRESH_DECOR), watermark: mark } }));
              onClose();
            }}
            className="fb-btn min-w-[180px]"
          >
            Apply
          </button>
        </div>
      }
    >
      <div className="sm:grid sm:grid-cols-[minmax(0,1fr)_270px]">
        <div className="sm:border-r sm:border-line">
          {section(
            "What",
            <>
              <Choice
                label="Kind"
                value={mark.kind}
                onChange={(kind) =>
                  set({ kind, ...(kind === "image" ? { angle: 0, size: 0.4 } : { angle: -45, size: 0.75 }) })
                }
                options={[
                  { value: "text", label: "Words" },
                  { value: "image", label: "Picture" },
                ]}
              />
              {mark.kind === "text" ? (
                <>
                  <input
                    value={mark.text}
                    aria-label="Words of the watermark"
                    maxLength={120}
                    onChange={(event) => set({ text: event.target.value })}
                    className="fb-input mt-3 !h-11"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {READY.map((text) => (
                      <button
                        key={text}
                        type="button"
                        onClick={() => set({ text })}
                        className="h-8 border border-line-strong bg-white px-2.5 text-[12px] hover:border-ink"
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <StyleFields store={store} style={mark.style} size={false} onChange={(style) => set({ style })} />
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => file.current?.click()}
                    className="fb-checker mt-3 grid h-[110px] w-full place-items-center border border-line-strong hover:border-ink"
                  >
                    {mark.asset && store.assets.get(mark.asset) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={store.assets.get(mark.asset)?.url}
                        alt=""
                        className="max-h-[94px] max-w-[90%] object-contain"
                      />
                    ) : (
                      <span className="flex items-center gap-2.5 bg-panel px-4 py-2.5 text-[14px]">
                        <ImagePlus size={17} aria-hidden />
                        Choose a picture
                      </span>
                    )}
                  </button>
                  <input
                    ref={file}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-label="Picture for the watermark"
                    onChange={(event) => {
                      const picked = event.target.files?.[0];
                      event.target.value = "";
                      if (!picked) return;
                      setProblem(null);
                      void store
                        .makeAsset(picked)
                        .then((asset) => set({ asset: asset.id }))
                        .catch(() => setProblem(`${picked.name} could not be read as a picture.`));
                    }}
                  />
                  {problem ? <p className="mt-2 text-[13px] text-danger">{problem}</p> : null}
                </>
              )}
            </>,
          )}
          {section(
            "How it looks",
            <div className="grid gap-4 sm:grid-cols-2">
              <Range
                label="Opacity"
                min={0.03}
                max={1}
                step={0.01}
                value={mark.opacity}
                show={`${Math.round(mark.opacity * 100)}%`}
                onChange={(opacity) => set({ opacity })}
              />
              <Range
                label="Size"
                min={0.08}
                max={1.2}
                step={0.02}
                value={mark.size}
                show={`${Math.round(mark.size * 100)}%`}
                onChange={(size) => set({ size })}
              />
              <Range
                label="Turned"
                min={-90}
                max={90}
                step={5}
                value={mark.angle}
                show={`${mark.angle}°`}
                onChange={(angle) => set({ angle })}
              />
              <div>
                <Choice
                  label="Place"
                  value={mark.tile ? "tile" : mark.place}
                  onChange={(value) =>
                    set(
                      value === "tile"
                        ? { tile: true, size: Math.min(mark.size, 0.3) }
                        : { tile: false, place: value as Watermark["place"] },
                    )
                  }
                  options={[
                    { value: "center", label: "Middle" },
                    { value: "top", label: "Top" },
                    { value: "bottom", label: "Bottom" },
                    { value: "tile", label: "All over" },
                  ]}
                />
              </div>
            </div>,
          )}
          {section(
            "Where",
            <PagesFields value={mark.pages} count={doc.pages.length} onChange={(pages) => set({ pages })} />,
          )}
        </div>
        <div className="hidden sm:block">{open ? <Preview store={store} decor={decor} height={320} /> : null}</div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- paper

const PAPER_COLORS = [
  "#ffffff",
  "#fdfaf3",
  "#f6efdd",
  "#eef4fb",
  "#eaf6ec",
  "#fdeee8",
  "#f4ecfa",
  "#f1f1ee",
  "#1d1c1f",
];

export function PaperDialog({ store, open, onClose }: { store: EditorStore; open: boolean; onClose: () => void }) {
  const page = useEditor(store, (s) => s.here);
  const [reach, setReach] = useState<"page" | "all" | "list">("all");
  const [list, setList] = useState("");
  const count = useEditor(store, (s) => s.doc.pages.length);
  const set = (color: string) => {
    const pages = store.doc.pages;
    const ids =
      reach === "all"
        ? pages.map((item) => item.id)
        : reach === "list"
          ? parsePages(list, pages.length).map((i) => pages[i].id)
          : store.view.marked.length > 1
            ? store.view.marked
            : page
              ? [page.id]
              : [];
    store.patchPages(ids, () => ({ paper: color === "#ffffff" ? undefined : color }), "paper");
  };
  const now = page?.paper ?? "#ffffff";
  return (
    <Sheet title="Paper colour" open={open} onClose={onClose} width={460}>
      <Part title="Where">
        <Choice
          label="Which pages"
          value={reach}
          onChange={setReach}
          options={[
            { value: "all", label: "All pages" },
            { value: "page", label: "This page" },
            { value: "list", label: "Some pages" },
          ]}
        />
        {reach === "list" ? (
          <input
            value={list}
            aria-label="Pages"
            placeholder={`1-3, 5, ${count}`}
            onChange={(event) => setList(event.target.value)}
            className="fb-input mt-2 !h-10"
          />
        ) : null}
      </Part>
      <Part title="Colour">
        <div className="flex flex-wrap items-center gap-2">
          {PAPER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={now === color}
              data-sound="select"
              onClick={() => set(color)}
              className={`h-10 w-10 border ${now === color ? "border-ink outline outline-2 outline-accent" : "border-line-strong hover:border-ink"}`}
              style={{ background: color }}
            />
          ))}
          <ColorPick label="Any colour" value={now} onChange={set} />
        </div>
        <p className="mt-3 text-[13px] leading-snug text-muted">
          The page lies on it. Pages that paint their own white over everything stay white.
        </p>
      </Part>
    </Sheet>
  );
}
