"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, Loader2 } from "lucide-react";
import { Dropzone } from "@/components/tool/kit/Dropzone";
import { ActionDock, Note, StudioFrame, StudioStage } from "@/components/tool/kit";
import { createRenderQueue } from "@/components/tool/viewer/render-queue";
import { useFileIntake } from "@/components/tool/studio/useFileIntake";
import { downloadBlob } from "@/lib/image/encode";
import { FormatBar, backToText } from "./FormatBar";
import { PageRail } from "./PageRail";
import { DownloadKey, Ribbon } from "./Ribbon";
import { SignDialog } from "./SignDialog";
import { Stage, type Place } from "./Stage";
import { isBold, isItalic, withEmphasis } from "./engine/fonts";
import { toPage } from "./interact";
import { pageOf, type Tool } from "./model";
import { EditorStore, isImage, isPdf, styleOfSelection, useEditor } from "./store";

const KEYS: Record<string, Tool> = { v: "select", t: "text", p: "pen", h: "highlight", w: "whiteout" };

/** Leaving with the browser's back key. */
const BACK = "back";

export function EditPdfStudio({ maxSizeMB }: { maxSizeMB: number }) {
  const [store] = useState(() => new EditorStore());
  const queue = useMemo(() => createRenderQueue(), []);
  const thumbs = useMemo(() => createRenderQueue(), []);
  const router = useRouter();

  const open = useEditor(store, (s) => s.doc.pages.length > 0);
  const opening = useEditor(store, (s) => s.view.opening);
  const error = useEditor(store, (s) => s.view.error);
  const dirty = useEditor(store, (s) => s.view.dirty);
  const saved = useEditor(store, (s) => s.view.saved);

  const [dragging, setDragging] = useState(false);
  const [rail, setRail] = useState(false);
  const [full, setFull] = useState(false);
  const [sign, setSign] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);

  const openInput = useRef<HTMLInputElement>(null);
  const pageInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const pageAt = useRef<number | undefined>(undefined);
  const replacing = useRef<string | null>(null);

  useEffect(() => () => store.close(), [store]);

  // With a file open the editor takes the room of the tool's title row.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.dataset.editor = "open";
    setRail(window.matchMedia("(min-width: 1024px)").matches);
    window.scrollTo({ top: 0 });
    return () => {
      delete root.dataset.editor;
    };
  }, [open]);

  useEffect(() => {
    if (!full) return;
    const { overflow } = document.documentElement.style;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = overflow;
    };
  }, [full]);

  // ------------------------------------------------------------ files coming in

  const allowed = useCallback(
    (files: File[]) => {
      const large = files.find((file) => file.size > maxSizeMB * 1024 * 1024);
      if (large) store.setView({ error: `${large.name} is larger than ${maxSizeMB} MB.` });
      return files.filter((file) => file.size <= maxSizeMB * 1024 * 1024);
    },
    [maxSizeMB, store],
  );

  /** The middle of what is on screen, as a spot on a page. */
  const spot = useCallback(() => {
    const box = store.scroller?.getBoundingClientRect();
    const page = store.page(store.view.page ?? "") ?? store.doc.pages[0];
    const sheet = page ? store.sheets.get(page.id)?.getBoundingClientRect() : null;
    if (!page || !sheet || !box) return page ? { page: page.id, x: page.w / 2, y: page.h / 2 } : null;
    const top = Math.max(sheet.top, box.top);
    const bottom = Math.min(sheet.bottom, box.bottom);
    const left = Math.max(sheet.left, box.left);
    const right = Math.min(sheet.right, box.right);
    if (bottom - top < 30 || right - left < 30) return { page: page.id, x: page.w / 2, y: page.h / 2 };
    const at = toPage(store, page, (left + right) / 2, (top + bottom) / 2);
    return { page: page.id, x: at.x, y: at.y };
  }, [store]);

  const placeImages = useCallback(
    async (files: File[], page: string, x: number, y: number) => {
      let shift = 0;
      for (const file of files) {
        try {
          await store.addImageFile(file, page, { x: x + shift, y: y + shift });
          shift += 18;
        } catch {
          store.setView({ error: `${file.name} could not be read as a picture.` });
        }
      }
    },
    [store],
  );

  const take = useCallback(
    async (list: File[], place: Place | null) => {
      const files = allowed(list);
      if (files.length === 0) return;
      const pdfs = files.filter(isPdf);
      const images = files.filter((file) => !isPdf(file) && isImage(file));
      if (pdfs.length + images.length === 0) {
        store.setView({ error: "Only PDFs and pictures can go in here." });
        return;
      }
      if (store.doc.pages.length === 0) {
        if (pdfs.length === 0) await store.insertFiles(images);
        else {
          await store.open(pdfs[0]);
          const rest = files.filter((file) => file !== pdfs[0] && (isPdf(file) || isImage(file)));
          if (rest.length > 0 && store.doc.pages.length > 0) await store.insertFiles(rest);
        }
        return;
      }
      if (place?.kind === "gap") {
        await store.insertFiles([...pdfs, ...images], place.index);
        return;
      }
      if (images.length > 0) {
        const at = place ? { page: place.page.id, x: place.x, y: place.y } : spot();
        if (at) await placeImages(images, at.page, at.x, at.y);
      }
      if (pdfs.length > 0) await store.insertFiles(pdfs, place ? place.index : undefined);
    },
    [allowed, placeImages, spot, store],
  );

  useFileIntake((files) => void take([...files], null), setDragging);

  const addFiles = useCallback((at: number) => {
    pageAt.current = at;
    pageInput.current?.click();
  }, []);

  // ------------------------------------------------------------ the way out

  const download = useCallback(async () => {
    if (store.view.busy || store.doc.pages.length === 0) return;
    try {
      const bytes = await store.save();
      const name = store.name.trim() || "document";
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${name}-edited.pdf`);
    } catch {
      // Said in the note.
    }
  }, [store]);

  useEffect(() => {
    if (!dirty || !open) return;
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    // Links of the site leave without reloading, so they are asked about here.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || link.origin !== window.location.origin)
        return;
      if (link.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setLeaving(link.pathname + link.search + link.hash);
    };
    // The search box goes there itself.
    const onLeave = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (path === window.location.pathname) return;
      event.preventDefault();
      setLeaving(path);
    };
    // Back first lands on a copy of this page, where it can be asked about.
    const hold = () => window.history.pushState(window.history.state, "", window.location.href);
    const onBack = () => {
      hold();
      setLeaving(BACK);
    };
    hold();
    window.addEventListener("beforeunload", ask);
    window.addEventListener("click", onClick, true);
    window.addEventListener("frebies:leave", onLeave);
    window.addEventListener("popstate", onBack);
    return () => {
      window.removeEventListener("beforeunload", ask);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("frebies:leave", onLeave);
      window.removeEventListener("popstate", onBack);
    };
  }, [dirty, open]);

  // ------------------------------------------------------------ keyboard

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || document.querySelector("dialog[open]")) return;
      const target = event.target as HTMLElement | null;
      const inText = Boolean(target?.isContentEditable);
      const inField =
        !inText &&
        Boolean(target?.closest("input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select"));
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const { selection, editing, tool, find } = store.view;
      const texts = editing ? [editing] : selection.filter((id) => store.doc.objects[id]?.type === "text");

      const run = (): boolean => {
        if (mod && !event.altKey) {
          if (key === "s") {
            void download();
            return true;
          }
          if (key === "f") {
            store.setView({ find: { ...find, open: true } });
            return true;
          }
          if (inField) return false;
          if (key === "z") {
            if (event.shiftKey) store.redo();
            else store.undo();
            return true;
          }
          if (key === "y") {
            store.redo();
            return true;
          }
          if (texts.length > 0 && (key === "b" || key === "i" || key === "u")) {
            const look = styleOfSelection(store);
            if (!look) return true;
            store.styleSelection(
              (style) =>
                key === "u"
                  ? { ...style, underline: !look.underline }
                  : withEmphasis(style, key === "b" ? { bold: !isBold(look) } : { italic: !isItalic(look) }),
              null,
              true,
            );
            requestAnimationFrame(() => backToText(store));
            return true;
          }
          if (inText) return false;
          if (key === "d" && selection.length > 0) {
            store.duplicate(selection);
            return true;
          }
          if (key === "a") {
            const page = store.page(store.view.page ?? "");
            if (page) store.select(page.objects.filter((id) => store.doc.objects[id]));
            return true;
          }
          if (
            (key === "c" || key === "x") &&
            selection.length > 0 &&
            (window.getSelection()?.toString() ?? "") === ""
          ) {
            store.copy(selection);
            if (key === "x") store.remove(selection);
            return true;
          }
          return false;
        }
        if (event.key === "Escape") {
          if (document.querySelector("[data-editor-panel]")) return false;
          if (store.view.crop) store.setView({ crop: null });
          else if (editing) {
            (document.activeElement as HTMLElement | null)?.blur();
            store.select([editing]);
          } else if (tool !== "select") store.setTool("select");
          else if (selection.length > 0) store.select([]);
          else if (find.open) store.setView({ find: { ...find, open: false, hits: [] } });
          else if (full) setFull(false);
          else return false;
          return true;
        }
        if (inText || inField || mod || event.altKey) return false;
        if (selection.length > 0) {
          if (event.key === "Delete" || event.key === "Backspace") {
            store.remove(selection);
            return true;
          }
          if (event.key === "Enter" && selection.length === 1 && texts.length === 1) {
            store.select(selection, selection[0]);
            return true;
          }
          if (event.key.startsWith("Arrow")) {
            const step = event.shiftKey ? 10 : 1;
            const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
            const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
            store.patchMany(selection, (object) => ({ x: object.x + dx, y: object.y + dy }), "nudge");
            return true;
          }
        }
        if (target?.closest("button, a, [role=button]") && (event.key === "Enter" || event.key === " ")) return false;
        if (!event.shiftKey && KEYS[key]) {
          store.setTool(KEYS[key]);
          return true;
        }
        return false;
      };
      if (!run()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (document.querySelector("dialog[open]") || event.clipboardData?.files.length) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest("input, textarea, select")) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (store.hasClip && text.replace(/\r\n/g, "\n") === store.clipText) {
        event.preventDefault();
        store.paste(store.view.page);
      } else if (text.trim() !== "") {
        event.preventDefault();
        const at = spot();
        if (at) store.pasteText(at.page, at.x, at.y, text.replace(/\r\n?/g, "\n").trim());
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("paste", onPaste);
    };
  }, [open, store, download, full, spot]);

  const selectedPage = useEditor(store, (s) =>
    s.view.selection[0] ? (pageOf(s.doc, s.view.selection[0])?.id ?? null) : null,
  );
  useEffect(() => {
    if (selectedPage && selectedPage !== store.view.page) store.setView({ page: selectedPage });
  }, [selectedPage, store]);

  // ------------------------------------------------------------ what is shown

  const inputs = (
    <>
      <input
        ref={openInput}
        type="file"
        accept="application/pdf,.pdf,image/*"
        multiple
        className="hidden"
        aria-label="Choose a PDF"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void take(files, null);
        }}
      />
      <input
        ref={pageInput}
        type="file"
        accept="application/pdf,.pdf,image/*"
        multiple
        className="hidden"
        aria-label="Add pages from files"
        onChange={(event) => {
          const files = allowed([...(event.target.files ?? [])]);
          event.target.value = "";
          if (files.length > 0) void store.insertFiles(files, pageAt.current);
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="Add a picture"
        onChange={(event) => {
          const files = allowed([...(event.target.files ?? [])]);
          const id = replacing.current;
          replacing.current = null;
          event.target.value = "";
          if (files.length === 0) return;
          if (id)
            void store
              .replaceImage(id, files[0])
              .catch(() => store.setView({ error: `${files[0].name} could not be read as a picture.` }));
          else {
            const at = spot();
            if (at) void placeImages(files, at.page, at.x, at.y);
          }
        }}
      />
    </>
  );

  if (!open) {
    return (
      <StudioFrame label="PDF editor" gridClassName="grid" className="border-b border-line">
        <StudioStage>
          {error ? (
            <div className="mb-3">
              <Note tone="error">{error}</Note>
              <span aria-hidden className="hidden" data-error={error} />
            </div>
          ) : null}
          {opening ? (
            <div role="status" className="grid min-h-[420px] flex-1 place-items-center">
              <p className="flex items-center gap-3 text-[16px]">
                <Loader2 size={20} className="animate-spin" aria-hidden />
                Opening your PDF…
              </p>
            </div>
          ) : (
            <Dropzone
              title="Drop a PDF to edit it"
              description="Click any text to change it. Move things, add pictures, sign, and add or delete pages."
              buttonLabel="Choose a PDF"
              limits={`PDF, up to ${maxSizeMB} MB`}
              note="Edited in your browser. Nothing is uploaded."
              onChoose={() => openInput.current?.click()}
              dragging={dragging}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void take([...event.dataTransfer.files], null);
              }}
            >
              <button
                type="button"
                onClick={() => store.startBlank()}
                className="inline-flex h-10 items-center gap-2 px-3 text-[14.5px] font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              >
                <FilePlus size={16} aria-hidden />
                Start with a blank page
              </button>
            </Dropzone>
          )}
        </StudioStage>
        {inputs}
      </StudioFrame>
    );
  }

  return (
    <section
      aria-label="PDF editor"
      className={`fb-editor flex min-h-0 flex-col bg-canvas ${
        full
          ? "fixed inset-0 z-[80]"
          : "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-[var(--fb-bar)] max-lg:z-30 lg:h-[calc(100dvh-var(--fb-bar))] lg:min-h-[540px]"
      }`}
    >
      <Ribbon
        store={store}
        rail={rail}
        full={full}
        onRail={() => setRail((value) => !value)}
        onFull={() => setFull((value) => !value)}
        onImage={() => {
          replacing.current = null;
          imageInput.current?.click();
        }}
        onSign={() => setSign(true)}
        onFind={() => store.setView({ find: { ...store.view.find, open: !store.view.find.open, hits: [] } })}
        onDownload={() => void download()}
        onClose={() => {
          setFull(false);
          store.close();
        }}
      />
      <FormatBar
        store={store}
        onReplaceImage={(id) => {
          replacing.current = id;
          imageInput.current?.click();
        }}
        onAddFiles={addFiles}
      />
      {error ? (
        <div className="relative shrink-0 border-b border-line bg-danger-soft">
          <p role="alert" className="px-4 py-2.5 pr-24 text-[14px] text-danger">
            {error}
          </p>
          <button
            type="button"
            onClick={() => store.setView({ error: null })}
            className="absolute inset-y-0 right-0 px-4 text-[13px] font-medium hover:bg-ink hover:text-white"
          >
            Dismiss
          </button>
          <span aria-hidden className="hidden" data-error={error} />
        </div>
      ) : null}
      <span aria-hidden className="hidden" data-success={saved > 0 ? `saved-${saved}` : undefined} />

      <div className="relative flex min-h-0 flex-1">
        {rail ? (
          <PageRail
            store={store}
            queue={thumbs}
            onAddFiles={addFiles}
            onDropFiles={(files, at) => void take(files, { kind: "gap", index: at })}
            onClose={() => setRail(false)}
            className="max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-[8] max-lg:shadow-[8px_0_0_rgba(24,24,27,0.12)]"
          />
        ) : null}
        <Stage
          store={store}
          queue={queue}
          onAddFiles={addFiles}
          onDropFiles={(files, place) => void take(files, place)}
        />
      </div>

      <ActionDock pinned={false} className="!px-3 !pb-[max(0.75rem,env(safe-area-inset-bottom))] !pt-3 lg:hidden">
        <div className="h-[56px]">
          <div className="flex h-full">
            <DownloadKey store={store} onClick={() => void download()} />
          </div>
        </div>
      </ActionDock>

      <SignDialog store={store} open={sign} onClose={() => setSign(false)} place={spot} />
      <LeaveDialog
        to={leaving}
        onStay={() => setLeaving(null)}
        onLeave={(to) => {
          setLeaving(null);
          store.close();
          if (to === BACK) setTimeout(() => window.history.go(-2), 0);
          else router.push(to);
        }}
      />
      {inputs}
    </section>
  );
}

function LeaveDialog({
  to,
  onStay,
  onLeave,
}: {
  to: string | null;
  onStay: () => void;
  onLeave: (to: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (to && !dialog.open) dialog.showModal();
    if (!to && dialog.open) dialog.close();
  }, [to]);
  return (
    <dialog
      ref={ref}
      aria-label="Leave the editor"
      onClose={onStay}
      className="m-auto w-[min(420px,calc(100vw-24px))] border border-ink bg-panel p-0 text-ink"
    >
      <div className="p-5">
        <p className="fb-wide text-[19px]">Leave without downloading?</p>
        <p className="mt-3 text-[15px] leading-snug text-muted">Your changes are only in this tab, and will be lost.</p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onStay} className="fb-btn !px-3">
            Keep editing
          </button>
          <button
            type="button"
            data-slot="file-close"
            onClick={() => to && onLeave(to)}
            className="h-[46px] border border-line-strong text-[14px] font-medium uppercase hover:bg-danger hover:text-white"
          >
            Leave
          </button>
        </div>
      </div>
    </dialog>
  );
}
