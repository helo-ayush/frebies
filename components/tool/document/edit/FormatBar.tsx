"use client";

import type { ReactNode } from "react";
import { Copy, FilePlus2, Group, Plus, RotateCcw, RotateCw, Trash2, Ungroup } from "lucide-react";
import { Ends, Hint, ICON } from "./BarParts";
import { MarginMenu } from "./MarginMenu";
import { FieldBar, ImageBar, InkBar, LinkBar, MarkBar, NoteBar, PathBar, ShapeBar, TableOffer } from "./ObjectBars";
import { TableBar } from "./TableBar";
import { TextBar, TextControls } from "./TextBar";
import { groupSelection, ungroupSelection } from "./commands";
import { cropPages, sizeLabel, uncropPages } from "./pages";
import {
  mixes,
  type EditObject,
  type ImageObject,
  type InkObject,
  type MarkObject,
  type NoteObject,
  type PathObject,
  type ShapeObject,
  type TextObject,
} from "./model";
import { useEditor, type EditorStore } from "./store";
import { BarButton, BarText, Rule } from "./ui";

export { backToText } from "./BarParts";

function PageBar({ store, onAddFiles }: { store: EditorStore; onAddFiles: (at: number) => void }) {
  const pages = useEditor(store, (s) => s.doc.pages);
  const current = useEditor(store, (s) => s.view.page);
  const marked = useEditor(store, (s) => s.view.marked);
  const at = Math.max(
    0,
    pages.findIndex((page) => page.id === current),
  );
  const page = pages[at];
  if (!page) return null;
  const ids = marked.length > 1 ? marked : [page.id];
  const many = ids.length > 1;
  return (
    <>
      <span className="fb-num shrink-0 whitespace-nowrap px-2 text-[13px]">
        {many ? (
          <>{ids.length} pages picked</>
        ) : (
          <>
            Page {at + 1} <span className="text-faint">of {pages.length}</span>
          </>
        )}
      </span>
      <Rule />
      <BarButton
        label={many ? "Turn these pages left" : "Turn the page left"}
        onClick={() => store.rotatePages(ids, -90)}
      >
        <RotateCcw {...ICON} />
      </BarButton>
      <BarButton
        label={many ? "Turn these pages right" : "Turn the page right"}
        onClick={() => store.rotatePages(ids, 90)}
      >
        <RotateCw {...ICON} />
      </BarButton>
      <BarButton
        label={many ? "Duplicate these pages" : "Duplicate the page"}
        sound="page"
        onClick={() => store.duplicatePages(ids)}
      >
        <Copy {...ICON} />
      </BarButton>
      <BarButton
        label={many ? "Delete these pages" : "Delete the page"}
        slot="page-remove"
        disabled={pages.length <= ids.length}
        onClick={() => store.deletePages(ids)}
        className="hover:!bg-danger hover:!text-white"
      >
        <Trash2 {...ICON} />
      </BarButton>
      <Rule />
      <MarginMenu store={store} />
      <span
        className="fb-num shrink-0 whitespace-nowrap px-2 text-[13px] text-muted max-[1280px]:hidden"
        title="Size of this page in points"
      >
        {sizeLabel(page)} pt
      </span>
      <Rule />
      <BarText label="Blank page" icon={<Plus {...ICON} />} sound="page" onClick={() => store.addBlank(at + 1)} />
      <BarText label="Add a file" icon={<FilePlus2 {...ICON} />} onClick={() => onAddFiles(at + 1)} />
      <span className="ml-auto hidden shrink-0 whitespace-nowrap pl-4 pr-2 text-[13px] text-muted min-[1240px]:block">
        Click to change or pick, double-click anywhere to type
      </span>
    </>
  );
}

function CropBar({ store }: { store: EditorStore }) {
  const area = useEditor(store, (s) => s.view.cropArea);
  const here = useEditor(store, (s) => s.here);
  const page = area ? store.page(area.page) : null;
  const done = () => store.setView({ cropArea: null, tool: "select" });
  return (
    <>
      {area && page ? (
        <>
          <BarText
            label="Crop this page"
            active
            onClick={() => {
              store.setView({ page: page.id });
              cropPages(store, area.box, page, "page");
              done();
            }}
          />
          <BarText
            label="Crop every page"
            onClick={() => {
              cropPages(store, area.box, page, "all");
              done();
            }}
          />
          <BarText label="Cancel" onClick={() => store.setView({ cropArea: null })} />
        </>
      ) : (
        <Hint>Drag a box around what should be left of the page.</Hint>
      )}
      {here?.box ? (
        <>
          <Rule />
          <BarText
            label="Show the whole page again"
            onClick={() => {
              uncropPages(store, "page");
              done();
            }}
          />
        </>
      ) : null}
    </>
  );
}

/** The second row: whatever can be done with what is selected. */
export function FormatBar({
  store,
  onReplaceImage,
  onAddFiles,
}: {
  store: EditorStore;
  onReplaceImage: (id: string) => void;
  onAddFiles: (at: number) => void;
}) {
  const tool = useEditor(store, (s) => s.view.tool);
  const selection = useEditor(store, (s) => s.view.selection);
  const all = useEditor(store, (s) => s.doc.objects);
  const objects = selection.map((id) => all[id]).filter((object): object is EditObject => Boolean(object));
  const kinds = new Set(objects.map((object) => object.type));
  const first = objects[0];

  let bar: ReactNode;
  if (objects.length > 0 && kinds.size === 1) {
    switch (first.type) {
      case "text":
        bar = <TextBar store={store} objects={objects as TextObject[]} />;
        break;
      case "image":
        bar = <ImageBar store={store} objects={objects as ImageObject[]} onReplace={onReplaceImage} />;
        break;
      case "shape":
        bar = <ShapeBar key={first.id} store={store} objects={objects as ShapeObject[]} tool={tool} />;
        break;
      case "path":
        bar = <PathBar store={store} objects={objects as PathObject[]} />;
        break;
      case "ink":
        bar = <InkBar store={store} objects={objects as InkObject[]} marker={mixes(first)} />;
        break;
      case "mark":
        bar = <MarkBar store={store} objects={objects as MarkObject[]} kind={first.kind} />;
        break;
      case "table":
        bar =
          objects.length === 1 ? (
            <TableBar key={first.id} store={store} table={first} />
          ) : (
            <>
              <TextControls store={store} objects={objects} />
              <Ends store={store} objects={objects} />
            </>
          );
        break;
      case "link":
        bar =
          objects.length === 1 ? (
            <LinkBar store={store} object={first} />
          ) : (
            <Ends store={store} objects={objects} plain />
          );
        break;
      case "field":
        bar =
          objects.length === 1 ? (
            <FieldBar key={first.id} store={store} object={first} />
          ) : (
            <Ends store={store} objects={objects} plain />
          );
        break;
      case "note":
        bar = <NoteBar store={store} objects={objects as NoteObject[]} />;
        break;
    }
  } else if (objects.length > 0) {
    const grouped = objects.some((object) => object.group);
    bar = (
      <>
        <span className="fb-num shrink-0 px-2 text-[13px]">{objects.length} selected</span>
        <BarButton
          label={grouped ? "Ungroup" : "Group"}
          hint={grouped ? "Ctrl Shift G" : "Ctrl G"}
          onClick={() => (grouped ? ungroupSelection(store) : groupSelection(store))}
        >
          {grouped ? <Ungroup {...ICON} /> : <Group {...ICON} />}
        </BarButton>
        <TableOffer store={store} objects={objects} />
        {kinds.has("text") ? (
          <>
            <Rule />
            <TextControls store={store} objects={objects.filter((object) => object.type === "text")} />
          </>
        ) : null}
        <Ends store={store} objects={objects} />
      </>
    );
  } else if (tool === "text")
    bar = (
      <>
        <TextControls store={store} objects={[]} />
        <Hint>Click where the text goes.</Hint>
      </>
    );
  else if (tool === "pen" || tool === "marker") bar = <InkBar store={store} objects={[]} marker={tool === "marker"} />;
  else if (tool === "highlight" || tool === "underline" || tool === "strike" || tool === "squiggle")
    bar = <MarkBar store={store} objects={[]} kind={tool} />;
  else if (tool === "link")
    bar = <Hint>Drag a box around what should be clickable. Existing links are outlined: click one to change it.</Hint>;
  else if (tool === "note") bar = <NoteBar store={store} objects={[]} />;
  else if (tool === "crop") bar = <CropBar store={store} />;
  else if (tool === "polygon")
    bar = (
      <>
        <ShapeBar store={store} objects={[]} tool="shape:rect" />
        <Hint>Click corner after corner. Click the first one again to close it, or press Enter to leave it open.</Hint>
      </>
    );
  else if (tool.startsWith("field-")) bar = <Hint>Click or drag where the field goes.</Hint>;
  else if (tool !== "select") bar = <ShapeBar store={store} objects={[]} tool={tool} />;
  else bar = <PageBar store={store} onAddFiles={onAddFiles} />;

  return (
    <div
      data-slot="format-bar"
      className="flex min-h-[50px] shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-panel pl-2 [scrollbar-width:none] sm:pl-3 [&::-webkit-scrollbar]:hidden"
    >
      {bar}
    </div>
  );
}
