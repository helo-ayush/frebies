"use client";

import { useState, type ReactNode, type RefObject } from "react";
import {
  AlignLeft,
  ArrowUpRight,
  Barcode,
  BookMarked,
  CalendarDays,
  Check,
  CheckSquare,
  CircleDot,
  Crop,
  Dot,
  Eraser,
  EyeOff,
  FilePlus2,
  FileText,
  FolderOpen,
  Grid3x3,
  Highlighter,
  ImagePlus,
  Info,
  Keyboard,
  Link2,
  List,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
  MousePointer2,
  Omega,
  Palette,
  PanelLeft,
  PanelTop,
  Pencil,
  Pentagon,
  Plus,
  Printer,
  QrCode,
  Ruler,
  Scaling,
  Search,
  Shapes,
  Signature,
  SquareCheck,
  SquareDashed,
  Stamp,
  Strikethrough,
  Table2,
  TextCursorInput,
  Type,
  Underline,
  Waves,
  Droplets,
  X,
} from "lucide-react";
import { SaveKey } from "./SaveMenu";
import { ShapeGrid } from "./ShapeGrid";
import { insertTable } from "./commands";
import type { Tool } from "./model";
import type { Format } from "./store";
import { STAMPS, addDate, addStamp } from "./stamps";
import { useEditor, type EditorStore } from "./store";
import { MenuRow, NumberBox, PlusMark, Pop } from "./ui";

const ICON = { size: 19, strokeWidth: 1.6, "aria-hidden": true } as const;
const SMALL = { size: 17, strokeWidth: 1.7, "aria-hidden": true } as const;

export type DialogName =
  | "new"
  | "size"
  | "bands"
  | "watermark"
  | "paper"
  | "symbols"
  | "qr"
  | "barcode"
  | "properties"
  | "bookmarks"
  | "shortcuts"
  | "sign"
  | "save";

type Choice = { tool: Tool; label: string; icon: ReactNode; hint?: string };

const DRAWING: Choice[] = [
  { tool: "pen", label: "Pen", icon: <Pencil {...SMALL} />, hint: "P" },
  { tool: "marker", label: "Marker", icon: <Highlighter {...SMALL} /> },
  { tool: "polygon", label: "Corner by corner", icon: <Pentagon {...SMALL} /> },
  { tool: "line", label: "Line", icon: <Minus {...SMALL} />, hint: "L" },
  { tool: "arrow", label: "Arrow", icon: <ArrowUpRight {...SMALL} /> },
];
const MARKS: Choice[] = [
  { tool: "highlight", label: "Highlight", icon: <Highlighter {...SMALL} />, hint: "H" },
  { tool: "underline", label: "Underline", icon: <Underline {...SMALL} /> },
  { tool: "strike", label: "Strike out", icon: <Strikethrough {...SMALL} /> },
  { tool: "squiggle", label: "Wavy line", icon: <Waves {...SMALL} /> },
  { tool: "note", label: "Comment", icon: <MessageSquare {...SMALL} />, hint: "N" },
];
const ERASING: Choice[] = [
  { tool: "whiteout", label: "Erase", icon: <Eraser {...SMALL} />, hint: "W" },
  { tool: "redact", label: "Black out for good", icon: <EyeOff {...SMALL} /> },
];
const TICKS: Choice[] = [
  { tool: "check", label: "Tick", icon: <Check {...SMALL} /> },
  { tool: "cross", label: "Cross", icon: <X {...SMALL} /> },
  { tool: "dot", label: "Dot", icon: <Dot {...SMALL} strokeWidth={5} /> },
];
const FIELDS: Choice[] = [
  { tool: "field-text", label: "Text box", icon: <TextCursorInput {...SMALL} /> },
  { tool: "field-multiline", label: "Long text box", icon: <AlignLeft {...SMALL} /> },
  { tool: "field-check", label: "Checkbox", icon: <SquareCheck {...SMALL} /> },
  { tool: "field-radio", label: "One of several", icon: <CircleDot {...SMALL} /> },
  { tool: "field-list", label: "Drop-down list", icon: <List {...SMALL} /> },
  { tool: "field-sign", label: "Place to sign", icon: <Signature {...SMALL} /> },
];

function Key({
  label,
  icon,
  active,
  disabled,
  onClick,
  hint,
  caret,
  buttonRef,
  expanded,
  slot,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  hint?: string;
  caret?: boolean;
  buttonRef?: RefObject<HTMLButtonElement>;
  expanded?: boolean;
  slot?: string;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      aria-pressed={active}
      aria-expanded={expanded}
      disabled={disabled}
      data-slot={slot}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`fb-ed-key group relative flex h-full shrink-0 flex-col items-center justify-center gap-[6px] transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        active ? "bg-white/75 [&_svg]:text-accent-deep" : expanded ? "bg-white/60" : "hover:bg-white/45"
      }`}
    >
      {icon}
      <span className="fb-ed-word flex items-center gap-1 whitespace-nowrap text-[12px] leading-none">
        <span className="fb-roll">
          <span>{label}</span>
          <span aria-hidden>{label}</span>
        </span>
        {caret ? <PlusMark open={expanded} /> : null}
      </span>
      <span
        aria-hidden
        className={`absolute inset-x-2 bottom-0 h-[2px] origin-left bg-accent transition-transform duration-300 ${
          active || expanded ? "scale-x-100" : "scale-x-0"
        }`}
      />
    </button>
  );
}

function Menu({
  label,
  icon,
  width = 220,
  active,
  children,
  hint,
}: {
  label: string;
  icon: ReactNode;
  width?: number;
  active?: boolean;
  hint?: string;
  children: (close: () => void) => ReactNode;
}) {
  return (
    <Pop
      label={label}
      width={width}
      button={(open, toggle, ref) => (
        <Key
          label={label}
          icon={icon}
          hint={hint}
          caret
          active={active}
          expanded={open}
          onClick={toggle}
          buttonRef={ref}
        />
      )}
    >
      {children}
    </Pop>
  );
}

const Head = ({ children }: { children: ReactNode }) => (
  <p className="border-t border-line px-3 pb-1.5 pt-3 text-[11.5px] uppercase tracking-[0.02em] text-muted first:border-t-0">
    {children}
  </p>
);

function Choices({ store, list, close }: { store: EditorStore; list: Choice[]; close: () => void }) {
  const tool = useEditor(store, (s) => s.view.tool);
  return (
    <>
      {list.map((choice) => (
        <MenuRow
          key={choice.tool}
          label={choice.label}
          icon={choice.icon}
          hint={choice.hint}
          active={tool === choice.tool}
          onClick={() => {
            store.setTool(choice.tool);
            close();
          }}
        />
      ))}
    </>
  );
}

const big = (icon: ReactNode) => <span className="[&_svg]:h-[19px] [&_svg]:w-[19px]">{icon}</span>;

/** So many rows, so many columns: drag over the squares, as in Word. */
function TablePick({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [over, setOver] = useState<{ r: number; c: number } | null>(null);
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(3);
  return (
    <div className="p-3">
      <div className="grid grid-cols-10 gap-[3px]" onPointerLeave={() => setOver(null)}>
        {Array.from({ length: 80 }, (_, i) => {
          const r = Math.floor(i / 10);
          const c = i % 10;
          const on = over !== null && r <= over.r && c <= over.c;
          return (
            <button
              key={i}
              type="button"
              aria-label={`${r + 1} by ${c + 1}`}
              onMouseDown={(event) => event.preventDefault()}
              onPointerEnter={() => setOver({ r, c })}
              onFocus={() => setOver({ r, c })}
              onClick={() => onPick(r + 1, c + 1)}
              className={`h-[21px] border ${on ? "border-accent-deep bg-accent/30" : "border-line-strong bg-white"}`}
            />
          );
        })}
      </div>
      <p className="fb-num mt-2 text-center text-[13px]">
        {over ? `${over.r + 1} rows, ${over.c + 1} columns` : "Choose a size"}
      </p>
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-line pt-2.5 text-[12.5px] text-muted">
        <NumberBox label="Rows" value={rows} min={1} max={200} width={36} onChange={setRows} />
        rows
        <NumberBox label="Columns" value={cols} min={1} max={40} width={34} onChange={setCols} />
        cols
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(rows, cols)}
          className="fb-btn ml-auto !h-9 !px-4 !text-[13px]"
        >
          Add
        </button>
      </div>
      <p className="mt-2.5 text-[12px] leading-snug text-muted">
        Cells copied from Excel or Sheets come in as a table when you paste them.
      </p>
    </div>
  );
}

/** The top row: the file, the tools, and the way out. */
export function Ribbon({
  store,
  rail,
  onRail,
  onImage,
  onFind,
  onOpen,
  onAddFiles,
  onPrint,
  onDialog,
  onSave,
  onClose,
  full,
  onFull,
  spot,
}: {
  store: EditorStore;
  rail: boolean;
  onRail: () => void;
  onImage: () => void;
  onFind: () => void;
  onOpen: () => void;
  onAddFiles: () => void;
  onPrint: () => void;
  onDialog: (name: DialogName) => void;
  /** Saves in this kind of file at once. */
  onSave: (format: Format) => void;
  onClose: () => void;
  full: boolean;
  onFull: () => void;
  /** The middle of what is on screen. */
  spot: () => { page: string; x: number; y: number } | null;
}) {
  const tool = useEditor(store, (s) => s.view.tool);
  const find = useEditor(store, (s) => s.view.find.open);
  const dirty = useEditor(store, (s) => s.view.dirty);
  const prefs = useEditor(store, (s) => s.view.prefs);
  const line = <span aria-hidden className="fb-ed-gap w-px shrink-0 bg-line" />;
  const on = (list: Choice[]) => list.find((choice) => choice.tool === tool);
  const drawing = on(DRAWING);
  const marking = on(MARKS);
  const erasing = on(ERASING);
  const filling = on([...TICKS, ...FIELDS]);

  return (
    <div data-slot="ribbon" className="fb-ed-bar flex h-[64px] shrink-0 items-stretch border-b border-line bg-panel">
      <div className="fb-ed-file flex min-w-0 items-center border-r border-line">
        <NameBox store={store} />
        <CloseFile dirty={dirty} onClose={onClose}>
          {(open, press, ref) => (
            <button
              ref={ref}
              type="button"
              aria-label="Close this file"
              title="Close this file"
              aria-expanded={open}
              data-slot="file-close"
              onClick={press}
              className="grid h-full w-10 shrink-0 place-items-center hover:bg-hover"
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </CloseFile>
      </div>

      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto flex shrink-0 items-stretch">
          <Menu label="File" icon={<FileText {...ICON} />} width={250}>
            {(close) => {
              const go = (work: () => void) => () => {
                close();
                work();
              };
              return (
                <>
                  <MenuRow label="New document" icon={<Plus {...SMALL} />} onClick={go(() => onDialog("new"))} />
                  <MenuRow
                    label="Open another file"
                    icon={<FolderOpen {...SMALL} />}
                    hint="Ctrl O"
                    onClick={go(onOpen)}
                  />
                  <MenuRow label="Add a file to this one" icon={<FilePlus2 {...SMALL} />} onClick={go(onAddFiles)} />
                  <MenuRow label="Print" icon={<Printer {...SMALL} />} hint="Ctrl P" onClick={go(onPrint)} />
                  <MenuRow
                    label="Bookmarks"
                    icon={<BookMarked {...SMALL} />}
                    onClick={go(() => onDialog("bookmarks"))}
                  />
                  <MenuRow
                    label="Title, author and keywords"
                    icon={<Info {...SMALL} />}
                    onClick={go(() => onDialog("properties"))}
                  />
                  <MenuRow
                    label="Keyboard shortcuts"
                    icon={<Keyboard {...SMALL} />}
                    hint="?"
                    onClick={go(() => onDialog("shortcuts"))}
                  />
                </>
              );
            }}
          </Menu>
          <Key label="Pages" icon={<PanelLeft {...ICON} />} active={rail} onClick={onRail} />
          {line}
          <Key
            label="Edit"
            hint="V"
            icon={<MousePointer2 {...ICON} />}
            active={tool === "select"}
            onClick={() => store.setTool("select")}
          />
          <Key
            label="Text"
            hint="T"
            icon={<Type {...ICON} />}
            active={tool === "text"}
            onClick={() => store.setTool("text")}
          />
          <Menu label="Table" icon={<Table2 {...ICON} />} width={286}>
            {(close) => (
              <TablePick
                onPick={(rows, cols) => {
                  close();
                  insertTable(store, rows, cols, spot());
                }}
              />
            )}
          </Menu>
          <Key label="Image" icon={<ImagePlus {...ICON} />} onClick={onImage} />
          <Menu label="Shapes" icon={<Shapes {...ICON} />} width={330} active={tool.startsWith("shape:")}>
            {(close) => (
              <ShapeGrid
                active={tool.startsWith("shape:") ? tool.slice(6) : undefined}
                onPick={(kind) => {
                  store.setTool(`shape:${kind}`);
                  close();
                }}
              />
            )}
          </Menu>
          <Menu
            label="Draw"
            icon={drawing ? big(drawing.icon) : <Pencil {...ICON} />}
            active={Boolean(drawing)}
            width={210}
          >
            {(close) => <Choices store={store} list={DRAWING} close={close} />}
          </Menu>
          <Menu
            label="Mark"
            icon={marking ? big(marking.icon) : <Highlighter {...ICON} />}
            active={Boolean(marking)}
            width={210}
          >
            {(close) => <Choices store={store} list={MARKS} close={close} />}
          </Menu>
          <Menu
            label="Erase"
            icon={erasing ? big(erasing.icon) : <Eraser {...ICON} />}
            active={Boolean(erasing)}
            width={220}
          >
            {(close) => <Choices store={store} list={ERASING} close={close} />}
          </Menu>
          <Menu label="Sign" icon={<Signature {...ICON} />} width={234}>
            {(close) => (
              <>
                <MenuRow
                  label="Signature"
                  icon={<Signature {...SMALL} />}
                  onClick={() => {
                    close();
                    onDialog("sign");
                  }}
                />
                <MenuRow
                  label="Today’s date"
                  icon={<CalendarDays {...SMALL} />}
                  onClick={() => {
                    close();
                    addDate(store, spot());
                  }}
                />
                <Head>Stamps</Head>
                <div className="grid grid-cols-2 gap-1.5 p-2">
                  {STAMPS.map((stamp) => (
                    <button
                      key={stamp.text}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        close();
                        addStamp(store, stamp, spot());
                      }}
                      className="truncate border-2 bg-white px-1.5 py-1.5 text-[11.5px] font-bold uppercase leading-none hover:bg-hover"
                      style={{ color: stamp.color, borderColor: stamp.color }}
                    >
                      {stamp.text}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Menu>
          <Menu label="Forms" icon={filling ? big(filling.icon) : <CheckSquare {...ICON} />} active={Boolean(filling)}>
            {(close) => (
              <>
                <Choices store={store} list={TICKS} close={close} />
                <Head>Fields to fill in</Head>
                <Choices store={store} list={FIELDS} close={close} />
              </>
            )}
          </Menu>
          <Menu label="Insert" icon={<Plus {...ICON} />} active={tool === "link"} width={226}>
            {(close) => {
              const go = (work: () => void) => () => {
                close();
                work();
              };
              return (
                <>
                  <MenuRow
                    label="Link"
                    icon={<Link2 {...SMALL} />}
                    hint="Ctrl K"
                    onClick={go(() => store.setTool("link"))}
                  />
                  <MenuRow
                    label="Comment"
                    icon={<MessageSquare {...SMALL} />}
                    hint="N"
                    onClick={go(() => store.setTool("note"))}
                  />
                  <MenuRow label="Symbol" icon={<Omega {...SMALL} />} onClick={go(() => onDialog("symbols"))} />
                  <MenuRow label="QR code" icon={<QrCode {...SMALL} />} onClick={go(() => onDialog("qr"))} />
                  <MenuRow label="Barcode" icon={<Barcode {...SMALL} />} onClick={go(() => onDialog("barcode"))} />
                  <MenuRow
                    label="Stamp or date"
                    icon={<Stamp {...SMALL} />}
                    onClick={go(() => addDate(store, spot()))}
                  />
                  <MenuRow
                    label="Blank page"
                    icon={<Plus {...SMALL} />}
                    sound="page"
                    onClick={go(() => store.addBlank())}
                  />
                  <MenuRow label="Document" icon={<FilePlus2 {...SMALL} />} onClick={go(onAddFiles)} />
                </>
              );
            }}
          </Menu>
          {line}
          <Menu label="Page" icon={<PanelTop {...ICON} />} active={tool === "crop"} width={232}>
            {(close) => {
              const go = (work: () => void) => () => {
                close();
                work();
              };
              return (
                <>
                  <MenuRow
                    label="Size and margins"
                    icon={<Scaling {...SMALL} />}
                    onClick={go(() => onDialog("size"))}
                  />
                  <MenuRow label="Crop" icon={<Crop {...SMALL} />} onClick={go(() => store.setTool("crop"))} />
                  <MenuRow
                    label="Header, footer, page numbers"
                    icon={<PanelTop {...SMALL} />}
                    onClick={go(() => onDialog("bands"))}
                  />
                  <MenuRow label="Watermark" icon={<Droplets {...SMALL} />} onClick={go(() => onDialog("watermark"))} />
                  <MenuRow label="Paper colour" icon={<Palette {...SMALL} />} onClick={go(() => onDialog("paper"))} />
                  <Head>On screen</Head>
                  <MenuRow
                    label="Margin lines"
                    icon={<SquareDashed {...SMALL} />}
                    hint={prefs.margins ? "On" : "Off"}
                    onClick={() => store.setPrefs({ margins: !prefs.margins })}
                  />
                  <MenuRow
                    label="Rulers"
                    icon={<Ruler {...SMALL} />}
                    hint={prefs.rulers ? "On" : "Off"}
                    onClick={() => store.setPrefs({ rulers: !prefs.rulers })}
                  />
                  <MenuRow
                    label="Grid to line things up"
                    icon={<Grid3x3 {...SMALL} />}
                    hint={prefs.grid ? "On" : "Off"}
                    onClick={() => store.setPrefs({ grid: !prefs.grid })}
                  />
                </>
              );
            }}
          </Menu>
          <Key label="Find" hint="Ctrl F" icon={<Search {...ICON} />} active={find} onClick={onFind} />
          <span className="fb-ed-close">
            <CloseFile dirty={dirty} onClose={onClose}>
              {(open, press, ref) => (
                <Key
                  label="Close"
                  icon={<X {...ICON} />}
                  onClick={press}
                  buttonRef={ref}
                  expanded={open}
                  slot="file-close"
                />
              )}
            </CloseFile>
          </span>
        </div>
      </div>

      <div className="fb-ed-save flex shrink-0 items-stretch border-l border-line max-lg:hidden">
        <Key
          label={full ? "Exit full" : "Full screen"}
          icon={full ? <Minimize2 {...ICON} /> : <Maximize2 {...ICON} />}
          active={full}
          onClick={onFull}
          slot={full ? "viewer-close" : "viewer-open"}
        />
        <div className="fb-ed-savekey flex">
          <SaveKey store={store} onSave={onSave} onMore={() => onDialog("save")} />
        </div>
      </div>
    </div>
  );
}

/** Closes the file, and asks first when there is something to lose. */
function CloseFile({
  dirty,
  onClose,
  children,
}: {
  dirty: boolean;
  onClose: () => void;
  children: (open: boolean, press: () => void, ref: RefObject<HTMLButtonElement>) => ReactNode;
}) {
  return (
    <Pop
      label="Close this file"
      width={250}
      button={(open, toggle, ref) => children(open, () => (dirty ? toggle() : onClose()), ref)}
    >
      {(close) => (
        <div className="p-3.5">
          <p className="text-[14.5px] leading-snug">Close without saving? The changes are only in this browser.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={close}
              className="h-10 border border-line-strong text-[13px] font-medium hover:bg-hover"
            >
              Keep editing
            </button>
            <button
              type="button"
              data-slot="file-close"
              onClick={() => {
                close();
                onClose();
              }}
              className="fb-btn !h-10 !px-3 !text-[13px]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </Pop>
  );
}

function NameBox({ store }: { store: EditorStore }) {
  const name = useEditor(store, (s) => s.name);
  return (
    <label className="fb-ed-name flex h-full min-w-0 flex-1 items-center pl-4" title="File name">
      <span className="sr-only">File name</span>
      <input
        value={name}
        spellCheck={false}
        onChange={(event) => store.rename(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
        }}
        className="h-9 w-full min-w-0 truncate border border-transparent bg-transparent px-1.5 text-[14px] font-medium outline-none hover:border-line-strong focus:border-ink focus:bg-white focus-visible:outline-none"
      />
    </label>
  );
}
