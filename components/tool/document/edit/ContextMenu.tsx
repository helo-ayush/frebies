"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  BringToFront,
  ClipboardPaste,
  Combine,
  Copy,
  CopyPlus,
  Crop,
  FilePlus2,
  Group,
  ImagePlus,
  Link2,
  Lock,
  LockOpen,
  MessageSquare,
  Plus,
  RotateCw,
  Scissors,
  SendToBack,
  Table2,
  Trash2,
  Type,
  Ungroup,
} from "lucide-react";
import { groupSelection, tableDo, ungroupSelection, insertTable } from "./commands";
import { gridOf } from "./engine/vectors";
import { pageOf, uid, type EditObject, type LinkObject, type NoteObject } from "./model";
import { useEditor, type EditorStore } from "./store";
import { MenuRow } from "./ui";

const ICON = { size: 16, strokeWidth: 1.7, "aria-hidden": true } as const;

/** What can be done right here, under the pointer. */
export function ContextMenu({
  store,
  onImage,
  onAddFiles,
}: {
  store: EditorStore;
  onImage: () => void;
  onAddFiles: (at: number) => void;
}) {
  const menu = useEditor(store, (s) => s.view.menu);
  const selection = useEditor(store, (s) => s.view.selection);
  const all = useEditor(store, (s) => s.doc.objects);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu || !panel.current) {
      setPlace(null);
      return;
    }
    const { offsetWidth: w, offsetHeight: h } = panel.current;
    setPlace({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - w - 8)),
      top: Math.max(8, menu.y + h > window.innerHeight - 8 ? Math.max(8, window.innerHeight - h - 8) : menu.y),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = () => store.setView({ menu: null });
    const away = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", away, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", close);
    };
  }, [menu, store]);

  if (!menu) return null;
  const objects = selection.map((id) => all[id]).filter((object): object is EditObject => Boolean(object));
  const ids = objects.map((object) => object.id);
  const first = objects[0];
  const index = store.doc.pages.findIndex((page) => page.id === menu.page);
  const go = (work: () => void) => () => {
    store.setView({ menu: null });
    work();
  };
  const rows: ReactNode[] = [];
  const row = (label: string, icon: ReactNode, work: () => void, hint?: string) =>
    rows.push(<MenuRow key={label} label={label} icon={icon} hint={hint} onClick={go(work)} />);

  if (objects.length > 0) {
    const grouped = objects.some((object) => object.group);
    const locked = objects.some((object) => object.lock);
    const texts = objects.filter((object) => object.type === "text");
    row("Cut", <Scissors {...ICON} />, () => (store.copy(ids), store.remove(ids)), "Ctrl X");
    row("Copy", <Copy {...ICON} />, () => store.copy(ids), "Ctrl C");
    row("Duplicate", <CopyPlus {...ICON} />, () => store.duplicate(ids), "Ctrl D");
    if (first.type === "table" && objects.length === 1) {
      row("Add a row below", <Plus {...ICON} />, () => tableDo(store, "row-below"));
      row("Add a column on the right", <Plus {...ICON} />, () => tableDo(store, "col-right"));
      row("Delete the row", <Trash2 {...ICON} />, () => tableDo(store, "row-delete"));
      row("Delete the column", <Trash2 {...ICON} />, () => tableDo(store, "col-delete"));
    }
    if (first.ops && first.type !== "image" && first.type !== "text") {
      const page = pageOf(store.doc, first.id);
      const units = page ? store.drawingOf(page.id, first) : [];
      if (page && units.length > 3 && gridOf(units))
        row("Edit as a table", <Table2 {...ICON} />, () => void store.openTable(page.id, units));
    }
    if (texts.length > 1)
      row("Join into one text", <Combine {...ICON} />, () => store.joinTexts(texts.map((object) => object.id)));
    if (first.type === "image" && objects.length === 1)
      row("Crop", <Crop {...ICON} />, () => store.setView({ crop: first.id }));
    if (objects.length === 1 && first.type !== "link")
      row("Put a link on it", <Link2 {...ICON} />, () => {
        const page = pageOf(store.doc, first.id);
        if (!page) return;
        const link: LinkObject = {
          id: uid("l"),
          type: "link",
          x: first.x,
          y: first.y,
          w: first.w,
          h: first.h,
          angle: 0,
          opacity: 1,
          url: "",
        };
        store.add(page.id, link);
      });
    if (objects.length > 1 && !grouped) row("Group", <Group {...ICON} />, () => groupSelection(store), "Ctrl G");
    if (grouped) row("Ungroup", <Ungroup {...ICON} />, () => ungroupSelection(store), "Ctrl Shift G");
    row("Bring to front", <BringToFront {...ICON} />, () => store.order(ids, "front"));
    row("Send to back", <SendToBack {...ICON} />, () => store.order(ids, "back"));
    row(locked ? "Unlock" : "Lock in place", locked ? <LockOpen {...ICON} /> : <Lock {...ICON} />, () =>
      store.patchMany(ids, () => ({ lock: locked ? undefined : true })),
    );
    row("Delete", <Trash2 {...ICON} />, () => store.remove(ids), "Del");
  } else {
    row("Type here", <Type {...ICON} />, () => store.addText(menu.page, menu.at.x, menu.at.y));
    if (store.hasClip) row("Paste", <ClipboardPaste {...ICON} />, () => store.paste(menu.page), "Ctrl V");
    row("Picture", <ImagePlus {...ICON} />, onImage);
    row("Table", <Table2 {...ICON} />, () => insertTable(store, 4, 3, { page: menu.page, ...menu.at }));
    row("Comment", <MessageSquare {...ICON} />, () => {
      const { prefs } = store.view;
      const note: NoteObject = {
        id: uid("n"),
        type: "note",
        x: menu.at.x - 10,
        y: menu.at.y - 10,
        w: 20,
        h: 20,
        angle: 0,
        opacity: 1,
        text: "",
        color: prefs.note,
        author: prefs.author,
        date: new Date().toISOString(),
      };
      store.add(menu.page, note);
    });
    row(
      "Pick everything on the page",
      <Group {...ICON} />,
      () => {
        const page = store.page(menu.page);
        if (page) store.select(page.objects.filter((id) => store.doc.objects[id] && !store.doc.objects[id].lock));
      },
      "Ctrl A",
    );
    row("Turn this page", <RotateCw {...ICON} />, () => store.rotatePages([menu.page], 90));
    row("Blank page after this one", <Plus {...ICON} />, () => store.addBlank(index + 1));
    row("Document after this page", <FilePlus2 {...ICON} />, () => onAddFiles(index + 1));
    if (store.doc.pages.length > 1) row("Delete this page", <Trash2 {...ICON} />, () => store.deletePages([menu.page]));
  }

  return (
    <div
      ref={panel}
      role="menu"
      data-editor-panel
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-[120] max-h-[calc(100dvh-16px)] w-[236px] overflow-y-auto border border-ink bg-panel text-ink shadow-[6px_6px_0_rgba(24,24,27,0.16)] [&_button]:min-h-[36px] [&_button]:py-1.5 [&_button]:text-[13.5px]"
      style={{ left: place?.left ?? -9999, top: place?.top ?? 0 }}
    >
      {rows}
    </div>
  );
}
