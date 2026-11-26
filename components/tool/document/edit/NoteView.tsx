"use client";

import { useEffect, useRef } from "react";
import { NoteArt } from "./Art";
import { pageBox, type NoteObject, type Page } from "./model";
import { useEditor, type EditorStore } from "./store";

/** A comment: a small sign on the page, and what it says beside it while it is picked. */
export function NoteView({
  store,
  page,
  note,
  selected,
}: {
  store: EditorStore;
  page: Page;
  note: NoteObject;
  selected: boolean;
}) {
  const alone = useEditor(store, (s) => s.view.selection.length === 1);
  const box = useRef<HTMLTextAreaElement>(null);
  const open = selected && alone;
  useEffect(() => {
    if (open && note.text === "") box.current?.focus({ preventScroll: true });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const whole = pageBox(page);
  const left = note.x - whole.x > whole.w / 2;
  return (
    <span className="group/note relative block" style={{ width: note.w, height: note.h }}>
      <NoteArt color={note.color} size={note.w} />
      {open ? (
        <span
          data-note-panel
          onPointerDown={(event) => event.stopPropagation()}
          className="pointer-events-auto absolute z-[9] block w-[230px] fb-ed-pop border border-line-strong bg-panel text-ink"
          style={{
            top: 0,
            [left ? "right" : "left"]: `calc(100% + 6px / var(--z))`,
            transform: "scale(calc(1 / var(--z)))",
            transformOrigin: left ? "100% 0" : "0 0",
            cursor: "default",
          }}
        >
          <span
            className="flex items-center gap-2 border-b border-line px-2.5 py-1.5"
            style={{ background: note.color }}
          >
            <input
              value={note.author}
              aria-label="Who wrote this"
              placeholder="Your name"
              maxLength={60}
              onChange={(event) => {
                store.patch<NoteObject>(note.id, { author: event.target.value }, `author:${note.id}`);
                store.setPrefs({ author: event.target.value });
              }}
              className="h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-[12.5px] font-medium outline-none focus-visible:outline-none"
            />
            <span className="fb-num shrink-0 text-[11.5px] text-ink/70">
              {new Date(note.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
          </span>
          <textarea
            ref={box}
            value={note.text}
            aria-label="Comment"
            placeholder="Write a comment"
            rows={4}
            onChange={(event) => store.patch<NoteObject>(note.id, { text: event.target.value }, `note:${note.id}`)}
            className="block w-full resize-y border-0 bg-white px-2.5 py-2 text-[13.5px] leading-snug outline-none focus-visible:outline-none"
          />
        </span>
      ) : note.text !== "" ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute z-[9] hidden w-max max-w-[220px] whitespace-pre-wrap border border-line-strong bg-panel px-2.5 py-1.5 text-[12.5px] leading-snug text-ink group-hover/note:block"
          style={{
            top: 0,
            [left ? "right" : "left"]: `calc(100% + 6px / var(--z))`,
            transform: "scale(calc(1 / var(--z)))",
            transformOrigin: left ? "100% 0" : "0 0",
          }}
        >
          {note.author ? <b className="block font-semibold">{note.author}</b> : null}
          {note.text}
        </span>
      ) : null}
    </span>
  );
}
