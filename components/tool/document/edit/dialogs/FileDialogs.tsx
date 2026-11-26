"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, IndentDecrease, IndentIncrease, Plus, Trash2, Wand2 } from "lucide-react";
import { makeMarks, readMarks } from "../bookmarks";
import { uid, type Mark, type Meta } from "../model";
import { useEditor, type EditorStore } from "../store";
import { Part, Sheet } from "./Sheet";

// ---------------------------------------------------------------- title, author

const NO_META: Meta = { title: "", author: "", subject: "", keywords: "" };

export function PropertiesDialog({ store, open, onClose }: { store: EditorStore; open: boolean; onClose: () => void }) {
  const [meta, setMeta] = useState<Meta>(NO_META);
  useEffect(() => {
    if (!open) return;
    if (store.doc.meta) {
      setMeta(store.doc.meta);
      return;
    }
    setMeta(NO_META);
    const source = store.sources.get(store.primary ?? "");
    if (!source) return;
    let off = false;
    void source.pdf
      .getMetadata()
      .then(({ info }) => {
        const own = info as Record<string, unknown>;
        const text = (key: string) => (typeof own[key] === "string" ? (own[key] as string) : "");
        if (!off)
          setMeta({
            title: text("Title"),
            author: text("Author"),
            subject: text("Subject"),
            keywords: text("Keywords"),
          });
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [open, store]);
  const field = (key: keyof Meta, label: string, hint?: string) => (
    <label className="block pb-3 last:pb-0">
      <span className="mb-1.5 block text-[13px] text-muted">{label}</span>
      <input
        value={meta[key]}
        placeholder={hint}
        maxLength={400}
        onChange={(event) => setMeta((now) => ({ ...now, [key]: event.target.value }))}
        className="fb-input !h-11"
      />
    </label>
  );
  return (
    <Sheet
      title="About this file"
      open={open}
      onClose={onClose}
      width={520}
      foot={
        <button
          type="button"
          onClick={() => {
            store.commit((doc) => ({ ...doc, meta }));
            onClose();
          }}
          className="fb-btn w-full"
        >
          Keep
        </button>
      }
    >
      <Part>
        {field("title", "Title")}
        {field("author", "Author")}
        {field("subject", "Subject")}
        {field("keywords", "Keywords", "first, second, third")}
      </Part>
    </Sheet>
  );
}

// ---------------------------------------------------------------- bookmarks

export function BookmarksDialog({ store, open, onClose }: { store: EditorStore; open: boolean; onClose: () => void }) {
  const doc = useEditor(store, (s) => s.doc);
  const here = useEditor(store, (s) => s.here);
  const [busy, setBusy] = useState(false);
  const list = doc.outline ?? [];

  useEffect(() => {
    if (!open || store.doc.outline) return;
    let off = false;
    setBusy(true);
    void readMarks(store).then((marks) => {
      if (off) return;
      setBusy(false);
      // Looking at them is not a change.
      store.silent((now) => (now.outline ? now : { ...now, outline: marks }));
    });
    return () => {
      off = true;
    };
  }, [open, store]);

  const set = (next: Mark[], key: string | null = null) => store.commit((now) => ({ ...now, outline: next }), key);
  const patch = (id: string, change: Partial<Mark>, key: string | null = null) =>
    set(
      list.map((mark) => (mark.id === id ? { ...mark, ...change } : mark)),
      key,
    );
  const move = (index: number, by: 1 | -1) => {
    const next = [...list];
    const [mark] = next.splice(index, 1);
    next.splice(index + by, 0, mark);
    set(next);
  };
  const numberOf = (id: string) => doc.pages.findIndex((page) => page.id === id) + 1;
  const tiny =
    "grid h-8 w-8 shrink-0 place-items-center hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-25";

  return (
    <Sheet
      title="Bookmarks"
      open={open}
      onClose={onClose}
      width={620}
      foot={
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (!here) return;
              const at = numberOf(here.id);
              const index = list.findIndex((mark) => numberOf(mark.page) > at);
              const mark: Mark = { id: uid("m"), title: `Page ${at}`, page: here.id, y: null, level: 0 };
              set(index < 0 ? [...list, mark] : [...list.slice(0, index), mark, ...list.slice(index)]);
            }}
            className="inline-flex h-11 items-center gap-2 border border-line-strong bg-white px-4 text-[14px] font-medium hover:border-ink hover:bg-ink hover:text-white"
          >
            <Plus size={16} aria-hidden />
            Add this page
          </button>
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              void makeMarks(store).then((marks) => {
                setBusy(false);
                if (marks.length > 0) set(marks);
                else store.say("No headings were found.");
              });
            }}
            className="inline-flex h-11 items-center gap-2 border border-line-strong bg-white px-4 text-[14px] font-medium hover:border-ink hover:bg-ink hover:text-white"
          >
            <Wand2 size={16} aria-hidden />
            Make them from the headings
          </button>
        </div>
      }
    >
      {busy ? (
        <p className="px-5 py-6 text-[14.5px] text-muted">Looking for them…</p>
      ) : list.length === 0 ? (
        <p className="px-5 py-6 text-[14.5px] leading-snug text-muted">
          There are none yet. Readers show bookmarks beside the pages, to jump to a chapter.
        </p>
      ) : (
        <ol>
          {list.map((mark, i) => (
            <li
              key={mark.id}
              className="flex items-center gap-1 border-b border-line py-1 pr-2"
              style={{ paddingLeft: 16 + mark.level * 22 }}
            >
              <input
                value={mark.title}
                aria-label="Bookmark"
                maxLength={200}
                onChange={(event) => patch(mark.id, { title: event.target.value }, `mark:${mark.id}`)}
                className="h-9 min-w-0 flex-1 border border-transparent bg-transparent px-2 text-[14px] outline-none hover:border-line-strong focus:border-ink focus:bg-white focus-visible:outline-none"
              />
              <label className="fb-num flex items-center gap-1 text-[12.5px] text-muted">
                p.
                <input
                  inputMode="numeric"
                  value={String(numberOf(mark.page))}
                  aria-label="Page"
                  onChange={(event) => {
                    const page = doc.pages[Number.parseInt(event.target.value, 10) - 1];
                    if (page) patch(mark.id, { page: page.id, y: null });
                  }}
                  className="h-8 w-10 border border-line bg-white px-1.5 text-right text-[13px] outline-none focus:border-ink focus-visible:outline-none"
                />
              </label>
              <button
                type="button"
                aria-label="Higher level"
                title="Higher level"
                disabled={mark.level === 0}
                onClick={() => patch(mark.id, { level: mark.level - 1 })}
                className={tiny}
              >
                <IndentDecrease size={15} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Under the one above"
                title="Under the one above"
                disabled={i === 0 || mark.level > list[i - 1].level}
                onClick={() => patch(mark.id, { level: mark.level + 1 })}
                className={tiny}
              >
                <IndentIncrease size={15} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Up"
                title="Up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className={tiny}
              >
                <ArrowUp size={15} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Down"
                title="Down"
                disabled={i === list.length - 1}
                onClick={() => move(i, 1)}
                className={tiny}
              >
                <ArrowDown size={15} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Remove"
                title="Remove"
                onClick={() => set(list.filter((item) => item.id !== mark.id))}
                className={`${tiny} hover:!bg-danger`}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- shortcuts

const KEYS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Anywhere",
    rows: [
      ["Ctrl Z / Ctrl Y", "Undo / redo"],
      ["Ctrl S", "Download"],
      ["Ctrl F", "Find and replace"],
      ["Ctrl P", "Print"],
      ["Ctrl O", "Open another file"],
      ["Ctrl + wheel", "Zoom"],
      ["Esc", "Leave what you are doing"],
      ["?", "This list"],
    ],
  },
  {
    title: "Picking and moving",
    rows: [
      ["Double-click on paper", "Type there"],
      ["Double-click on a line or shape", "Pick the whole drawing"],
      ["Drag over the page", "Pick everything inside"],
      ["Shift + click", "Add to what is picked"],
      ["Arrow keys", "Move by 1 pt, with Shift by 10"],
      ["Alt + drag", "Drag away a copy"],
      ["Ctrl C / X / V / D", "Copy / cut / paste / duplicate"],
      ["Ctrl G / Ctrl Shift G", "Group / ungroup"],
      ["Ctrl ] / Ctrl [", "Forward / backward"],
      ["Delete", "Delete"],
    ],
  },
  {
    title: "Typing",
    rows: [
      ["1. then space", "Numbered list (also 1) (1) a. A. i. I.)"],
      ["- or * then space", "Bullets ([] gives boxes)"],
      ["Tab / Shift Tab", "One level in / out"],
      ["Enter twice", "End the list"],
      ["Shift Enter", "New line in the same paragraph"],
      ["Ctrl B / I / U", "Bold / italic / underline"],
      ["Ctrl Shift X", "Strike through"],
      ["Ctrl Shift L / E / R / J", "Left / centre / right / justify"],
      ["Ctrl Shift 7 / 8", "Numbers / bullets"],
      ["Ctrl . / Ctrl ,", "Superscript / subscript"],
      ["Ctrl Shift > / <", "Larger / smaller"],
      ["Ctrl K", "Link"],
      ["Ctrl \\", "Clear the formatting"],
      ["-> (c) (r) (tm) 1/2", "→ © ® ™ ½"],
    ],
  },
  {
    title: "Tables",
    rows: [
      ["Tab / Shift Tab", "Next cell / cell before (a new row at the end)"],
      ["Arrow keys", "Cell to cell"],
      ["Drag over cells", "Pick them"],
      ["Delete", "Empty the picked cells"],
      ["Shift + drag a line", "The table grows instead of the next column shrinking"],
    ],
  },
  {
    title: "Tools",
    rows: [
      ["V", "Edit"],
      ["T", "Text"],
      ["P", "Pen"],
      ["H", "Highlight"],
      ["W", "Erase"],
      ["L", "Line"],
      ["R", "Rectangle"],
      ["O", "Ellipse"],
      ["N", "Comment"],
    ],
  },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet title="Keyboard shortcuts" open={open} onClose={onClose} width={760}>
      <div className="sm:columns-2 sm:gap-0">
        {KEYS.map(({ title, rows }) => (
          <div key={title} className="break-inside-avoid px-5 py-4">
            <p className="mb-2 text-[13px] text-muted">{title}</p>
            <dl>
              {rows.map(([key, what]) => (
                <div
                  key={key}
                  className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 text-[13.5px] last:border-b-0"
                >
                  <dt className="fb-num shrink-0 text-[12.5px] font-medium">{key}</dt>
                  <dd className="text-right leading-snug text-muted">{what}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- password

export function PasswordDialog({ store }: { store: EditorStore }) {
  const asking = useEditor(store, (s) => s.asking);
  const [password, setPassword] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setPassword("");
    if (asking) requestAnimationFrame(() => input.current?.focus());
  }, [asking]);
  return (
    <Sheet title="Password" open={asking !== null} onClose={() => store.answer(null)} width={460}>
      {asking ? (
        <form
          className="px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (password !== "") store.answer(password);
          }}
        >
          <p className="text-[15px] leading-snug">
            {asking.why === "open"
              ? `${asking.file} is locked. Its password opens it here.`
              : `${asking.file} can be read, but its owner locked changes. The owner’s password is needed to edit it.`}
          </p>
          <input
            ref={input}
            type="password"
            autoComplete="off"
            value={password}
            aria-label="Password of the file"
            onChange={(event) => setPassword(event.target.value)}
            className="fb-input mt-4 !h-11"
          />
          {asking.wrong ? (
            <p role="alert" className="mt-2 text-[13.5px] text-danger">
              That is not the right password.
            </p>
          ) : null}
          <p className="mt-2 text-[13px] text-muted">The file stays in your browser, and so does the password.</p>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => store.answer(null)}
              className="h-[46px] border border-line-strong text-[14px] font-medium hover:bg-hover"
            >
              Cancel
            </button>
            <button type="submit" disabled={password === ""} className="fb-btn !px-3">
              Open
            </button>
          </div>
        </form>
      ) : null}
    </Sheet>
  );
}
