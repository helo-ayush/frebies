"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ALargeSmall,
  Bold,
  Check,
  ChevronDown,
  Combine,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Paintbrush,
  PaintBucket,
  Plus,
  RemoveFormatting,
  SplitSquareVertical,
  Strikethrough,
  Subscript,
  Superscript,
  Type,
  Underline,
  UnfoldVertical,
  Unlink,
} from "lucide-react";
import { Drop, Ends, ICON, backToText } from "./BarParts";
import {
  PRESETS,
  alignSelection,
  applyPreset,
  clearLook,
  indentSelection,
  linkSelection,
  listSelection,
  pickPainter,
  setCase,
  setScript,
  spaceLines,
  spaceParas,
  startListAt,
  styleSelection,
  targetsOf,
  textBoxes,
} from "./commands";
import {
  LIBRARY,
  addUserFont,
  fontLabel,
  isBold,
  isItalic,
  labelCss,
  pdfFont,
  registerLibrary,
  userFontList,
  withEmphasis,
} from "./engine/fonts";
import { paraSize } from "./engine/text-dom";
import {
  BULLETS,
  NUMBERS,
  numberMark,
  paraCount,
  splitParas,
  type EditObject,
  type Style,
  type TextObject,
} from "./model";
import { documentFonts, paraOfSelection, styleOfSelection, useEditor, type EditorStore } from "./store";
import { BarButton, ColorPick, MenuRow, NumberBox, Pop, Rule, Slider } from "./ui";

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96];

// ---------------------------------------------------------------- fonts

export function FontPick({
  store,
  value,
  onChange,
  wide = 142,
}: {
  store: EditorStore;
  value: string;
  onChange: (id: string) => void;
  wide?: number;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <Pop
        label="Font"
        width={276}
        button={(open, toggle, ref) => (
          <button
            ref={ref}
            type="button"
            aria-label={`Font: ${fontLabel(value)}`}
            aria-expanded={open}
            title="Font"
            data-slot="font-picker"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              registerLibrary();
              toggle();
            }}
            style={{ width: wide }}
            className="flex h-9 shrink-0 items-center justify-between gap-2 border border-line-strong bg-white px-2.5 text-left text-[14px] hover:border-ink"
          >
            <span className="truncate" style={labelCss(value)}>
              {fontLabel(value)}
            </span>
            <ChevronDown size={13} className="shrink-0" aria-hidden />
          </button>
        )}
      >
        {(close) => (
          <FontList
            store={store}
            value={value}
            onPick={(id) => (onChange(id), close())}
            onAdd={() => file.current?.click()}
            problem={problem}
          />
        )}
      </Pop>
      <input
        ref={file}
        type="file"
        accept=".ttf,.otf,font/ttf,font/otf"
        className="hidden"
        aria-label="Add a font file"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          if (!picked) return;
          setProblem(null);
          void picked
            .arrayBuffer()
            .then((bytes) => addUserFont(picked.name.replace(/\.[^.]+$/, ""), bytes))
            .then((font) => onChange(font.id))
            .catch(() => setProblem(`${picked.name} is not a font this editor can use.`));
        }}
      />
    </>
  );
}

function FontList({
  store,
  value,
  onPick,
  onAdd,
  problem,
}: {
  store: EditorStore;
  value: string;
  onPick: (id: string) => void;
  onAdd: () => void;
  problem: string | null;
}) {
  const own = documentFonts(store);
  const mine = userFontList();
  const here = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    here.current?.scrollIntoView({ block: "center" });
  }, []);
  const name = pdfFont(value)?.name;
  const row = (id: string, label: string, like?: string) => {
    const on = id === value || (name !== undefined && pdfFont(id)?.name === name);
    return (
      <button
        key={id}
        ref={on ? here : undefined}
        type="button"
        aria-pressed={on}
        data-sound="select"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onPick(id)}
        className={`flex min-h-[38px] w-full items-center justify-between gap-3 px-3 py-1.5 text-left ${on ? "fb-ed-row-on" : "hover:bg-hover"}`}
      >
        <span className="truncate text-[16px] leading-tight" style={labelCss(id)}>
          {label}
        </span>
        {like ? <span className={`shrink-0 text-[11.5px] text-faint`}>{like}</span> : null}
      </button>
    );
  };
  const head = (text: string) => (
    <p className="sticky top-0 z-[1] border-y border-line bg-canvas px-3 py-1.5 text-[12px] uppercase text-muted first:border-t-0">
      {text}
    </p>
  );
  return (
    <div>
      {own.length > 0 ? (
        <>
          {head("In this PDF")}
          {own.map((font) => row(font.id, fontLabel(font.id)))}
        </>
      ) : null}
      {mine.length > 0 ? (
        <>
          {head("Yours")}
          {mine.map((font) => row(font.id, font.name))}
        </>
      ) : null}
      {(["Sans", "Serif", "Typewriter", "Handwriting", "Hindi"] as const).map((group) => (
        <div key={group}>
          {head(group)}
          {LIBRARY.filter((family) => family.group === group).map((family) => row(family.id, family.name, family.like))}
        </div>
      ))}
      <div className="sticky bottom-0 border-t border-line-strong bg-panel">
        {problem ? <p className="px-3 pt-2 text-[13px] text-danger">{problem}</p> : null}
        <MenuRow label="Add a font file" hint="TTF, OTF" icon={<Plus size={15} aria-hidden />} onClick={onAdd} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- lists

function ListPick({ store, type }: { store: EditorStore; type: "bullet" | "number" }) {
  const now = useEditor(store, () => paraOfSelection(store)?.para.list);
  const on = now?.type === type;
  const marks = type === "bullet" ? BULLETS : NUMBERS;
  const [typed, setTyped] = useState("");
  const set = (mark: string) => {
    listSelection(store, { type, mark });
    requestAnimationFrame(() => backToText(store));
  };
  const Icon = type === "bullet" ? List : ListOrdered;
  const label = type === "bullet" ? "Bullets" : "Numbering";
  return (
    <span className="flex shrink-0">
      <BarButton
        label={label}
        hint={type === "bullet" ? "Ctrl Shift 8" : "Ctrl Shift 7"}
        active={on}
        onClick={() => set(on && now ? (now.level === 0 ? now.mark : marks[0]) : marks[0])}
        className="!min-w-8 !px-1"
      >
        <Icon {...ICON} />
      </BarButton>
      <Pop
        label={label}
        width={214}
        button={(open, toggle, ref) => (
          <button
            ref={ref}
            type="button"
            aria-label={`${label}, other kinds`}
            aria-expanded={open}
            title={`${label}, other kinds`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggle}
            className={`grid h-9 w-[18px] shrink-0 place-items-center ${open ? "bg-hover" : "hover:bg-hover"}`}
          >
            <ChevronDown size={11} aria-hidden />
          </button>
        )}
      >
        {(close) => (
          <div>
            <div className="grid grid-cols-3 gap-px bg-line">
              {marks.map((mark) => (
                <button
                  key={mark}
                  type="button"
                  aria-pressed={on && now?.mark === mark}
                  data-sound="select"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => (set(mark), close())}
                  className={`h-[46px] text-[16px] ${on && now?.mark === mark ? "fb-ed-on" : "bg-panel hover:bg-hover"}`}
                  style={type === "bullet" ? { fontFamily: '"fb-symbols", "fb-arimo", sans-serif' } : undefined}
                >
                  {type === "number" ? [1, 2, 3].map((n) => numberMark(mark, n)).join(" ") : mark}
                </button>
              ))}
            </div>
            {type === "bullet" ? (
              <label className="flex items-center gap-2 border-t border-line px-3 py-2 text-[13px]">
                Your own
                <input
                  value={typed}
                  maxLength={2}
                  onChange={(event) => {
                    setTyped(event.target.value);
                    if (event.target.value.trim()) listSelection(store, { type, mark: event.target.value.trim() });
                  }}
                  className="fb-input !h-8 !w-14 !px-2 text-center"
                  aria-label="Your own bullet"
                />
              </label>
            ) : on ? (
              <span className="flex items-center gap-2 border-t border-line px-3 py-2 text-[13px]">
                Start at
                <NumberBox
                  label="Start at"
                  value={now?.start ?? 1}
                  min={0}
                  max={9999}
                  width={54}
                  onChange={(value) => startListAt(store, value === 1 ? null : value)}
                />
              </span>
            ) : null}
            {now ? <MenuRow label="No list" onClick={() => (listSelection(store, null), close())} /> : null}
          </div>
        )}
      </Pop>
    </span>
  );
}

// ---------------------------------------------------------------- links

export function LinkPick({ store, look }: { store: EditorStore; look: Style }) {
  const [url, setUrl] = useState<string | null>(null);
  const put = (close: () => void) => {
    const value = (url ?? look.link ?? "").trim();
    linkSelection(store, value === "" ? null : value);
    setUrl(null);
    close();
    requestAnimationFrame(() => backToText(store));
  };
  return (
    <Pop
      label="Link"
      width={290}
      button={(open, toggle, ref) => (
        <button
          ref={ref}
          type="button"
          data-link-button
          aria-label="Link"
          aria-expanded={open}
          title="Link (Ctrl K)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setUrl(null);
            toggle();
          }}
          className={`grid h-9 min-w-9 shrink-0 place-items-center px-1.5 ${look.link || open ? "bg-hover" : "hover:bg-hover"}`}
        >
          <Link2 {...ICON} />
        </button>
      )}
    >
      {(close) => (
        <div className="p-3">
          <input
            autoFocus
            type="text"
            inputMode="url"
            aria-label="Link address"
            placeholder="example.com or name@example.com"
            value={url ?? look.link ?? ""}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                put(close);
              }
            }}
            className="fb-input !h-9 w-full !px-2.5 !text-[13.5px]"
          />
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => put(close)} className="fb-btn !h-9 !px-3 !text-[13px]">
              {look.link ? "Change" : "Add link"}
            </button>
            <button
              type="button"
              disabled={!look.link}
              onClick={() => {
                linkSelection(store, null);
                close();
              }}
              className="flex h-9 items-center justify-center gap-1.5 border border-line-strong text-[13px] font-medium hover:bg-hover disabled:opacity-35"
            >
              <Unlink size={14} aria-hidden />
              Remove
            </button>
          </div>
        </div>
      )}
    </Pop>
  );
}

// ---------------------------------------------------------------- the bar

/** Everything about words: in text boxes, shapes and table cells alike. */
export function TextControls({ store, objects }: { store: EditorStore; objects: EditObject[] }) {
  const view = useEditor(store, (s) => s.view);
  useEditor(store, (s) => s.doc);
  const look: Style = styleOfSelection(store) ?? view.prefs.text;
  const para = paraOfSelection(store);
  const none = targetsOf(store).length === 0;
  const boxes = objects.filter((object): object is TextObject => object.type === "text");
  const style = (patch: (style: Style) => Style, key: string | null = null) => {
    styleSelection(store, patch, key);
    requestAnimationFrame(() => backToText(store));
  };
  const keep = (work: () => void) => () => {
    work();
    requestAnimationFrame(() => backToText(store));
  };
  const align = para ? (para.para.align ?? para.body.align) : "left";
  const runs = para ? (splitParas(para.body.runs)[para.index] ?? para.body.runs) : [];
  const spacing = para ? (para.para.leading ?? para.body.leading) / paraSize(runs) : 1.22;
  return (
    <>
      <FontPick
        store={store}
        value={look.font}
        onChange={(font) =>
          style((now) =>
            font.startsWith("pdf:")
              ? { ...now, font, bold: false, italic: false, tracking: 0 }
              : {
                  ...now,
                  font,
                  bold: isBold(now),
                  italic: isItalic(now),
                  tracking: now.font.startsWith("pdf:") ? 0 : now.tracking,
                },
          )
        }
      />
      <NumberBox
        label="Text size"
        value={Math.round(look.size * 10) / 10}
        min={1}
        max={600}
        width={42}
        presets={SIZES}
        onChange={(size) => style((now) => ({ ...now, size }), "size")}
        onDone={() => backToText(store)}
      />
      <Rule />
      <BarButton
        label="Bold"
        hint="Ctrl B"
        active={isBold(look)}
        onClick={() => style((now) => withEmphasis(now, { bold: !isBold(look) }))}
        className="!min-w-8 !px-1"
      >
        <Bold {...ICON} strokeWidth={2.2} />
      </BarButton>
      <BarButton
        label="Italic"
        hint="Ctrl I"
        active={isItalic(look)}
        onClick={() => style((now) => withEmphasis(now, { italic: !isItalic(look) }))}
        className="!min-w-8 !px-1"
      >
        <Italic {...ICON} />
      </BarButton>
      <BarButton
        label="Underline"
        hint="Ctrl U"
        active={look.underline}
        onClick={() => style((now) => ({ ...now, underline: !look.underline }))}
        className="!min-w-8 !px-1"
      >
        <Underline {...ICON} />
      </BarButton>
      <BarButton
        label="Strike through"
        hint="Ctrl Shift X"
        active={look.strike}
        onClick={() => style((now) => ({ ...now, strike: !look.strike }))}
        className="!min-w-8 !px-1"
      >
        <Strikethrough {...ICON} />
      </BarButton>
      <ColorPick
        label="Text colour"
        value={look.color}
        icon={<Type size={16} strokeWidth={2} aria-hidden />}
        onChange={(color) => style((now) => ({ ...now, color }), "color")}
      />
      <ColorPick
        label="Colour behind the words"
        value={look.back ?? null}
        icon={<Highlighter size={16} strokeWidth={1.9} aria-hidden />}
        onChange={(back) => style((now) => ({ ...now, back }), "back")}
        onNone={() => style((now) => ({ ...now, back: undefined }), "back")}
      />
      <Rule />
      {(
        [
          ["left", "Align left", "Ctrl Shift L", AlignLeft],
          ["center", "Centre", "Ctrl Shift E", AlignCenter],
          ["right", "Align right", "Ctrl Shift R", AlignRight],
          ["justify", "Justify", "Ctrl Shift J", AlignJustify],
        ] as const
      ).map(([value, label, hint, Icon]) => (
        <BarButton
          key={value}
          label={label}
          hint={hint}
          disabled={none}
          active={!none && align === value}
          onClick={keep(() => alignSelection(store, value))}
          className="!min-w-8 !px-1"
        >
          <Icon {...ICON} />
        </BarButton>
      ))}
      <Rule />
      <ListPick store={store} type="bullet" />
      <ListPick store={store} type="number" />
      <BarButton
        label="One level out"
        hint="Shift Tab"
        disabled={none}
        onClick={keep(() => indentSelection(store, -1))}
        className="!min-w-8 !px-1"
      >
        <IndentDecrease {...ICON} />
      </BarButton>
      <BarButton
        label="One level in"
        hint="Tab"
        disabled={none}
        onClick={keep(() => indentSelection(store, 1))}
        className="!min-w-8 !px-1"
      >
        <IndentIncrease {...ICON} />
      </BarButton>
      <Drop label="Spacing between lines, paragraphs and letters" icon={<UnfoldVertical {...ICON} />} width={246}>
        {() => (
          <>
            <div className="grid grid-cols-4 gap-px border-b border-line bg-line">
              {[1, 1.15, 1.5, 2].map((value) => (
                <button
                  key={value}
                  type="button"
                  data-sound="select"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => spaceLines(store, value * 1.15)}
                  className={`fb-num h-9 text-[13px] ${Math.abs(spacing - value * 1.15) < 0.03 ? "fb-ed-on" : "bg-panel hover:bg-hover"}`}
                >
                  {value}
                </button>
              ))}
            </div>
            <Slider
              label="Between lines"
              min={0.8}
              max={3}
              step={0.05}
              value={Math.min(3, Math.max(0.8, spacing))}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => spaceLines(store, v)}
            />
            <Slider
              label="Before paragraphs"
              min={0}
              max={48}
              step={1}
              value={Math.min(48, para?.para.before ?? 0)}
              format={(v) => `${v} pt`}
              onChange={(v) => spaceParas(store, "before", v)}
            />
            <Slider
              label="After paragraphs"
              min={0}
              max={48}
              step={1}
              value={Math.min(48, para?.para.after ?? 0)}
              format={(v) => `${v} pt`}
              onChange={(v) => spaceParas(store, "after", v)}
            />
            <Slider
              label="Between letters"
              min={-2}
              max={12}
              step={0.1}
              value={Math.min(12, Math.max(-2, look.tracking))}
              format={(v) => `${v.toFixed(1)} pt`}
              onChange={(tracking) => styleSelection(store, (now) => ({ ...now, tracking }), "tracking")}
            />
          </>
        )}
      </Drop>
      <Drop label="Styles" text="Styles" width={230}>
        {(close) =>
          PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-sound="select"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                applyPreset(store, preset);
                close();
                requestAnimationFrame(() => backToText(store));
              }}
              className="flex min-h-[40px] w-full items-center border-b border-line px-3 py-1.5 text-left last:border-b-0 hover:bg-hover"
            >
              <span
                className="truncate leading-tight"
                style={{
                  fontSize: Math.min(22, Math.max(11, preset.size)),
                  fontWeight: preset.bold ? 700 : 400,
                  fontStyle: preset.italic ? "italic" : undefined,
                  fontFamily: preset.font ? '"fb-cousine", monospace' : '"fb-arimo", sans-serif',
                  color: preset.color,
                }}
              >
                {preset.label}
              </span>
            </button>
          ))
        }
      </Drop>
      <BarButton
        label={view.painter ? "Stop copying the look" : "Copy this look to other text"}
        active={Boolean(view.painter)}
        disabled={none && !view.painter}
        onClick={() => pickPainter(store)}
        className="!min-w-8 !px-1"
      >
        <Paintbrush {...ICON} />
      </BarButton>
      <LinkPick store={store} look={look} />
      <Drop label="More for text" icon={<ALargeSmall size={18} strokeWidth={1.8} aria-hidden />} width={232}>
        {(close) => (
          <>
            <div className="grid grid-cols-4 gap-px border-b border-line bg-line">
              {(
                [
                  ["upper", "ABC"],
                  ["lower", "abc"],
                  ["title", "Abc"],
                  ["sentence", "Abc."],
                ] as const
              ).map(([how, label]) => (
                <button
                  key={how}
                  type="button"
                  title={
                    { upper: "CAPITALS", lower: "small letters", title: "Every Word", sentence: "Like a sentence" }[how]
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={keep(() => setCase(store, how))}
                  className="h-10 bg-panel text-[14px] hover:bg-hover"
                >
                  {label}
                </button>
              ))}
            </div>
            <MenuRow
              label="Superscript"
              hint="Ctrl ."
              icon={<Superscript {...ICON} />}
              active={look.script === "super"}
              onClick={keep(() => setScript(store, "super"))}
            />
            <MenuRow
              label="Subscript"
              hint="Ctrl ,"
              icon={<Subscript {...ICON} />}
              active={look.script === "sub"}
              onClick={keep(() => setScript(store, "sub"))}
            />
            <MenuRow
              label="Clear the formatting"
              hint="Ctrl \\"
              icon={<RemoveFormatting {...ICON} />}
              onClick={() => (clearLook(store), close(), requestAnimationFrame(() => backToText(store)))}
            />
            {boxes.length > 1 ? (
              <MenuRow
                label="Join into one text"
                icon={<Combine {...ICON} />}
                onClick={() => (store.joinTexts(boxes.map((box) => box.id)), close())}
              />
            ) : null}
            {boxes.length === 1 && paraCount(boxes[0].runs) > 1 ? (
              <MenuRow
                label="Split into paragraphs"
                icon={<SplitSquareVertical {...ICON} />}
                onClick={() => (store.splitText(boxes[0].id), close())}
              />
            ) : null}
            {boxes.length > 0 ? (
              <>
                <MenuRow
                  label="Wrap inside the box"
                  icon={boxes[0].wrap ? <Check {...ICON} /> : <span />}
                  onClick={() =>
                    textBoxes(store, (box) => ({ wrap: !boxes[0].wrap, w: Math.max(box.w, 20), max: undefined }))
                  }
                />
                <span className="flex items-center gap-2 border-t border-line px-3 py-1.5 text-[13px]">
                  <span className="flex-1">Box colour</span>
                  <ColorPick
                    label="Box colour"
                    value={boxes[0].fill ?? null}
                    icon={<PaintBucket size={15} aria-hidden />}
                    onChange={(fill) => textBoxes(store, (box) => ({ fill, pad: box.pad ?? 4 }), "box-fill")}
                    onNone={() => textBoxes(store, () => ({ fill: null }), "box-fill")}
                  />
                </span>
                {boxes[0].fill ? (
                  <Slider
                    label="Room around the words"
                    min={0}
                    max={24}
                    step={1}
                    value={boxes[0].pad ?? 4}
                    format={(v) => `${v} pt`}
                    onChange={(pad) => textBoxes(store, () => ({ pad }), "box-pad")}
                  />
                ) : null}
              </>
            ) : null}
            <label className="flex items-center gap-2.5 border-t border-line px-3 py-2.5 text-[13px]">
              <input
                type="checkbox"
                checked={view.prefs.spell}
                onChange={(event) => store.setPrefs({ spell: event.target.checked })}
                className="h-4 w-4 accent-[#1d1c1f]"
              />
              Check spelling while typing
            </label>
            <label className="flex items-center gap-2.5 border-t border-line px-3 py-2.5 text-[13px]">
              <input
                type="checkbox"
                checked={view.prefs.auto}
                onChange={(event) => store.setPrefs({ auto: event.target.checked })}
                className="h-4 w-4 accent-[#1d1c1f]"
              />
              Turn “1.” and “-” into lists
            </label>
            <label className="flex items-center gap-2.5 border-t border-line px-3 py-2.5 text-[13px]">
              <input
                type="checkbox"
                checked={view.prefs.room}
                onChange={(event) => store.setPrefs({ room: event.target.checked })}
                className="h-4 w-4 accent-[#1d1c1f]"
              />
              Move what is below as text grows
            </label>
          </>
        )}
      </Drop>
    </>
  );
}

export function TextBar({ store, objects }: { store: EditorStore; objects: TextObject[] }) {
  return (
    <>
      <TextControls store={store} objects={objects} />
      {objects.length > 0 ? <Ends store={store} objects={objects} /> : null}
    </>
  );
}
