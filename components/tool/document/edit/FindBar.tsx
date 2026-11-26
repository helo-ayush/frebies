"use client";

import { useEffect, useRef, useState } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, Loader2, WholeWord, X } from "lucide-react";
import type { FindHow } from "./engine/find";
import { useEditor, type EditorStore } from "./store";
import { BarButton } from "./ui";

/** Finds words in the whole document, and puts others in their place. */
export function FindBar({ store }: { store: EditorStore }) {
  const find = useEditor(store, (s) => s.view.find);
  const doc = useEditor(store, (s) => s.doc);
  const [text, setText] = useState(find.query);
  const [swap, setSwap] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    // Opened again with the words from before.
    if (store.view.find.query !== "") void store.find(store.view.find.query, store.view.find.how, true);
  }, [store]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text !== store.view.find.query) void store.find(text);
    }, 180);
    return () => clearTimeout(timer);
  }, [text, store]);

  // The document moved on: the places found may have too.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (store.view.find.open && store.view.find.query !== "")
        void store.find(store.view.find.query, store.view.find.how, true);
    }, 350);
    return () => clearTimeout(timer);
  }, [doc, store]);

  const close = () => store.setView({ find: { ...store.view.find, open: false, hits: [] } });
  const look = (how: Partial<FindHow>) => void store.find(text, { ...store.view.find.how, ...how });

  const replace = async (all: boolean) => {
    const { hits, at, how, query } = store.view.find;
    const picked = all ? hits : hits.slice(at, at + 1);
    if (picked.length === 0) return;
    const count = await store.replace(picked, swap);
    setNote(`${count} ${count === 1 ? "place" : "places"} changed`);
    await store.find(query, how, true);
    if (!all) {
      const now = store.view.find;
      if (now.hits[now.at]) store.show(now.hits[now.at].page, now.hits[now.at].spots[0]);
    }
  };

  const count = find.hits.length;
  return (
    <div
      role="search"
      aria-label="Find and replace"
      className="absolute right-3 top-3 z-[6] w-[min(420px,calc(100%-24px))] border border-ink bg-panel shadow-[6px_6px_0_rgba(24,24,27,0.16)]"
    >
      <div className="flex items-center border-b border-line">
        <input
          ref={input}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setNote(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (text !== store.view.find.query) void store.find(text);
            else store.findStep(event.shiftKey ? -1 : 1);
          }}
          placeholder="Find"
          aria-label="Find"
          className="h-11 min-w-0 flex-1 bg-transparent px-3.5 text-[14.5px] outline-none focus-visible:outline-none"
        />
        <span role="status" className="fb-num shrink-0 px-2 text-[12.5px] text-muted">
          {find.searching ? (
            <Loader2 size={14} className="animate-spin" aria-label="Searching" />
          ) : text === "" ? (
            ""
          ) : count === 0 ? (
            "None"
          ) : (
            `${find.at + 1} of ${count}`
          )}
        </span>
        <BarButton
          label="Capitals matter"
          active={find.how.matchCase}
          onClick={() => look({ matchCase: !find.how.matchCase })}
          className="!min-w-8 !px-1"
        >
          <CaseSensitive size={18} aria-hidden />
        </BarButton>
        <BarButton
          label="Whole words only"
          active={find.how.whole}
          onClick={() => look({ whole: !find.how.whole })}
          className="!min-w-8 !px-1"
        >
          <WholeWord size={17} aria-hidden />
        </BarButton>
        <BarButton
          label="Find the one before"
          hint="Shift Enter"
          disabled={count === 0}
          onClick={() => store.findStep(-1)}
          className="!min-w-8 !px-1"
        >
          <ChevronUp size={17} aria-hidden />
        </BarButton>
        <BarButton
          label="Find the next one"
          hint="Enter"
          disabled={count === 0}
          onClick={() => store.findStep(1)}
          className="!min-w-8 !px-1"
        >
          <ChevronDown size={17} aria-hidden />
        </BarButton>
        <BarButton label="Close find" slot="viewer-close" onClick={close}>
          <X size={16} aria-hidden />
        </BarButton>
      </div>
      <div className="flex items-center gap-1 p-1.5">
        <input
          value={swap}
          onChange={(event) => setSwap(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void replace(false);
            }
          }}
          placeholder="Replace with"
          aria-label="Replace with"
          className="h-9 min-w-0 flex-1 border border-line-strong bg-white px-2.5 text-[14px] outline-none focus:border-ink focus-visible:outline-none"
        />
        <button
          type="button"
          disabled={count === 0}
          onClick={() => void replace(false)}
          className="h-9 shrink-0 border border-line-strong px-2.5 text-[13px] font-medium hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-35"
        >
          Replace
        </button>
        <button
          type="button"
          disabled={count === 0}
          onClick={() => void replace(true)}
          className="h-9 shrink-0 border border-line-strong px-2.5 text-[13px] font-medium hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-35"
        >
          All
        </button>
      </div>
      {note ? (
        <p role="status" className="border-t border-line px-3.5 py-2 text-[13px] text-muted">
          {note}
        </p>
      ) : null}
    </div>
  );
}
