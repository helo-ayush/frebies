"use client";

import type { ReactNode, RefObject } from "react";
import {
  ArrowUpRight,
  CheckSquare,
  ChevronDown,
  Circle,
  Download,
  Eraser,
  Highlighter,
  ImagePlus,
  Link2,
  List,
  Loader2,
  Maximize,
  Minimize,
  Minus,
  MousePointer2,
  PanelLeft,
  Pencil,
  Redo2,
  Search,
  Signature,
  Square,
  Strikethrough,
  SquareCheck,
  TextCursorInput,
  Type,
  Underline,
  Undo2,
  Check,
  X,
  Dot,
  AlignLeft,
  Shapes,
} from "lucide-react";
import type { Tool } from "./model";
import { useEditor, type EditorStore } from "./store";
import { MenuRow, Pop } from "./ui";

const ICON = { size: 19, strokeWidth: 1.6, "aria-hidden": true } as const;
const SMALL = { size: 17, strokeWidth: 1.7, "aria-hidden": true } as const;

type Choice = { tool: Tool; label: string; icon: ReactNode; hint?: string };

const SHAPES: Choice[] = [
  { tool: "rect", label: "Rectangle", icon: <Square {...SMALL} /> },
  { tool: "ellipse", label: "Ellipse", icon: <Circle {...SMALL} /> },
  { tool: "line", label: "Line", icon: <Minus {...SMALL} /> },
  { tool: "arrow", label: "Arrow", icon: <ArrowUpRight {...SMALL} /> },
];
const DRAWING: Choice[] = [
  { tool: "pen", label: "Pen", icon: <Pencil {...SMALL} />, hint: "P" },
  { tool: "marker", label: "Marker", icon: <Highlighter {...SMALL} /> },
];
const MARKS: Choice[] = [
  { tool: "highlight", label: "Highlight", icon: <Highlighter {...SMALL} />, hint: "H" },
  { tool: "underline", label: "Underline", icon: <Underline {...SMALL} /> },
  { tool: "strike", label: "Strike out", icon: <Strikethrough {...SMALL} /> },
];
const FORMS: Choice[] = [
  { tool: "check", label: "Tick", icon: <Check {...SMALL} /> },
  { tool: "cross", label: "Cross", icon: <X {...SMALL} /> },
  { tool: "dot", label: "Dot", icon: <Dot {...SMALL} strokeWidth={5} /> },
];
const FIELDS: Choice[] = [
  { tool: "field-text", label: "Text box", icon: <TextCursorInput {...SMALL} /> },
  { tool: "field-multiline", label: "Long text box", icon: <AlignLeft {...SMALL} /> },
  { tool: "field-check", label: "Checkbox", icon: <SquareCheck {...SMALL} /> },
  { tool: "field-list", label: "Drop-down list", icon: <List {...SMALL} /> },
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
  always = false,
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
  /** Keeps its word even when the bar is tight. */
  always?: boolean;
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
      className={`fb-ed-key group relative flex h-full min-w-[54px] shrink-0 flex-col items-center justify-center gap-[5px] px-2 transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        active ? "bg-ink text-white" : expanded ? "bg-hover" : "hover:bg-hover"
      }`}
    >
      {icon}
      <span
        className={`flex items-center gap-0.5 whitespace-nowrap text-[12px] leading-none ${always ? "" : "fb-ed-word"}`}
      >
        {label}
        {caret ? <ChevronDown size={11} aria-hidden /> : null}
      </span>
      {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" /> : null}
    </button>
  );
}

function Group({
  store,
  label,
  icon,
  choices,
  more,
  moreLabel,
}: {
  store: EditorStore;
  label: string;
  icon: ReactNode;
  choices: Choice[];
  more?: Choice[];
  moreLabel?: string;
}) {
  const tool = useEditor(store, (s) => s.view.tool);
  const on = [...choices, ...(more ?? [])].find((choice) => choice.tool === tool);
  const rows = (list: Choice[], close: () => void) =>
    list.map((choice) => (
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
    ));
  return (
    <Pop
      label={label}
      width={210}
      button={(open, toggle, ref) => (
        <Key
          label={label}
          icon={on ? <span className="[&_svg]:h-[19px] [&_svg]:w-[19px]">{on.icon}</span> : icon}
          caret
          active={Boolean(on)}
          expanded={open}
          onClick={toggle}
          buttonRef={ref}
        />
      )}
    >
      {(close) => (
        <>
          {rows(choices, close)}
          {more ? (
            <p className="border-y border-line bg-canvas px-3 py-1.5 text-[12px] uppercase text-muted">{moreLabel}</p>
          ) : null}
          {more ? rows(more, close) : null}
        </>
      )}
    </Pop>
  );
}

/** The top row: the file, the tools, and the way out. */
export function Ribbon({
  store,
  rail,
  full,
  onRail,
  onFull,
  onImage,
  onSign,
  onFind,
  onDownload,
  onClose,
}: {
  store: EditorStore;
  rail: boolean;
  full: boolean;
  onRail: () => void;
  onFull: () => void;
  onImage: () => void;
  onSign: () => void;
  onFind: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const tool = useEditor(store, (s) => s.view.tool);
  const canUndo = useEditor(store, (s) => s.canUndo);
  const canRedo = useEditor(store, (s) => s.canRedo);
  const find = useEditor(store, (s) => s.view.find.open);
  const dirty = useEditor(store, (s) => s.view.dirty);
  const line = <span aria-hidden className="my-3 w-px shrink-0 bg-line-strong" />;

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
              className="grid h-full w-11 shrink-0 place-items-center hover:bg-hover"
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </CloseFile>
      </div>

      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Key label="Pages" icon={<PanelLeft {...ICON} />} active={rail} onClick={onRail} />
        {line}
        <Key label="Undo" hint="Ctrl Z" icon={<Undo2 {...ICON} />} disabled={!canUndo} onClick={() => store.undo()} />
        <Key label="Redo" hint="Ctrl Y" icon={<Redo2 {...ICON} />} disabled={!canRedo} onClick={() => store.redo()} />
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
        <Key label="Image" icon={<ImagePlus {...ICON} />} onClick={onImage} />
        <Key label="Sign" icon={<Signature {...ICON} />} onClick={onSign} />
        <Group store={store} label="Draw" icon={<Pencil {...ICON} />} choices={DRAWING} />
        <Group store={store} label="Shapes" icon={<Shapes {...ICON} />} choices={SHAPES} />
        <Group store={store} label="Mark" icon={<Highlighter {...ICON} />} choices={MARKS} />
        <Key
          label="Erase"
          hint="W"
          icon={<Eraser {...ICON} />}
          active={tool === "whiteout"}
          onClick={() => store.setTool("whiteout")}
        />
        <Group
          store={store}
          label="Forms"
          icon={<CheckSquare {...ICON} />}
          choices={FORMS}
          more={FIELDS}
          moreLabel="Fields to fill in"
        />
        <Key label="Link" icon={<Link2 {...ICON} />} active={tool === "link"} onClick={() => store.setTool("link")} />
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
        <span className="max-lg:hidden">
          <Key
            label={full ? "Shrink" : "Expand"}
            icon={full ? <Minimize {...ICON} /> : <Maximize {...ICON} />}
            onClick={onFull}
            slot={full ? "viewer-close" : "viewer-open"}
          />
        </span>
      </div>

      <div className="fb-ed-save flex w-[186px] shrink-0 items-stretch max-lg:hidden">
        <DownloadKey store={store} onClick={onDownload} />
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
          <p className="text-[14.5px] leading-snug">Close without downloading? The changes are only in this tab.</p>
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
              className="h-10 bg-ink text-[13px] font-medium text-white hover:bg-danger"
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

/** The one loud key. Fills up while the file is being put together. */
export function DownloadKey({ store, onClick }: { store: EditorStore; onClick: () => void }) {
  const busy = useEditor(store, (s) => s.view.busy);
  const saving = busy?.label.startsWith("Saving") ? busy : null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(busy)}
      aria-busy={saving ? true : undefined}
      data-slot="primary-action"
      data-tone="done"
      className="fb-run !min-h-0"
    >
      {saving ? (
        <span aria-hidden className="fb-run-fill" style={{ width: `${Math.max(6, (saving.progress ?? 0) * 100)}%` }} />
      ) : null}
      <span className="fb-run-icon !w-[52px]">
        {saving ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Download size={18} aria-hidden />}
      </span>
      <span className="fb-run-label">{saving ? "Saving…" : "Download"}</span>
    </button>
  );
}
