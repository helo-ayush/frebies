"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, History, Loader2, Trash2 } from "lucide-react";
import { Dropzone } from "@/components/tool/kit/Dropzone";
import { ActionDock, Note, StudioFrame, StudioStage } from "@/components/tool/kit";
import { createRenderQueue } from "@/components/tool/viewer/render-queue";
import { useFileIntake } from "@/components/tool/studio/useFileIntake";
import { downloadBlob } from "@/lib/image/encode";
import { ContextMenu } from "./ContextMenu";
import { FormatBar } from "./FormatBar";
import { PageRail } from "./PageRail";
import { DownloadKey, Ribbon, type DialogName } from "./Ribbon";
import { SignDialog } from "./SignDialog";
import { Stage, type Place } from "./Stage";
import { pasteCells, tableOf } from "./commands";
import { BandsDialog, PaperDialog, WatermarkDialog } from "./dialogs/DecorDialogs";
import { BookmarksDialog, PasswordDialog, PropertiesDialog, ShortcutsDialog } from "./dialogs/FileDialogs";
import { CodeDialog, SymbolsDialog } from "./dialogs/InsertDialogs";
import { NewDialog, SizeDialog } from "./dialogs/PageSetup";
import { SaveDialog, type SaveChoice } from "./dialogs/SaveDialog";
import { findDraft, forgetDraft, keepDraft, openDraft, type Draft } from "./drafts";
import { rowsFromHtml, rowsFromText } from "./engine/table";
import { toPage } from "./interact";
import { pressKey } from "./keys";
import { marginBox, pageOf } from "./model";
import { EditorStore, OPENS, isImage, useEditor } from "./store";

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
  const doc = useEditor(store, (s) => s.doc);

  const [dragging, setDragging] = useState(false);
  const [rail, setRail] = useState(false);
  const [full, setFull] = useState(false);
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

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

  // ------------------------------------------------------------ work in progress

  useEffect(() => {
    if (open) return;
    let off = false;
    void findDraft()
      .then((found) => !off && setDraft(found))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !dirty) return;
    const timer = setTimeout(() => {
      void keepDraft(store).catch(() => undefined);
    }, 2500);
    return () => clearTimeout(timer);
  }, [doc, dirty, open, store]);

  // Downloaded as a whole: there is nothing left to lose.
  useEffect(() => {
    if (saved > 0 && !store.view.dirty) void forgetDraft().catch(() => undefined);
  }, [saved, store]);

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
    const page = store.here;
    if (!page) return null;
    const inner = marginBox(page);
    const middle = { page: page.id, x: inner.x + inner.w / 2, y: inner.y + inner.h / 2 };
    const sheet = store.sheets.get(page.id)?.getBoundingClientRect();
    if (!sheet || !box) return middle;
    const top = Math.max(sheet.top, box.top);
    const bottom = Math.min(sheet.bottom, box.bottom);
    const left = Math.max(sheet.left, box.left);
    const right = Math.min(sheet.right, box.right);
    if (bottom - top < 30 || right - left < 30) return middle;
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
      if (store.doc.pages.length === 0) {
        await store.open(files[0]);
        if (files.length > 1 && store.doc.pages.length > 0) await store.insertFiles(files.slice(1));
        return;
      }
      const images = files.filter(isImage);
      const documents = files.filter((file) => !isImage(file));
      if (place?.kind === "gap") {
        await store.insertFiles(files, place.index);
        return;
      }
      if (images.length > 0) {
        const at = place ? { page: place.page.id, x: place.x, y: place.y } : spot();
        if (at) await placeImages(images, at.page, at.x, at.y);
      }
      if (documents.length > 0) await store.insertFiles(documents, place ? place.index : undefined);
    },
    [allowed, placeImages, spot, store],
  );

  useFileIntake((files) => void take([...files], null), setDragging);

  const addFiles = useCallback((at: number) => {
    pageAt.current = at;
    pageInput.current?.click();
  }, []);

  // ------------------------------------------------------------ the way out

  const saveAs = useCallback(
    async (choice: SaveChoice) => {
      if (store.view.busy || store.doc.pages.length === 0) return;
      try {
        const { saveAs: make } = await import("./convert/save");
        const { blob, name } = await make(store, choice);
        downloadBlob(blob, name);
      } catch {
        // Said in the note.
      }
    },
    [store],
  );
  const download = useCallback(
    () => void saveAs({ format: store.view.format, pages: null, dpi: 150, options: {} }),
    [saveAs, store],
  );
  const print = useCallback(async () => {
    if (store.view.busy || store.doc.pages.length === 0) return;
    try {
      const { printDocument } = await import("./convert/save");
      await printDocument(store);
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

  // ------------------------------------------------------------ keyboard and clipboard

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || document.querySelector("dialog[open]")) return;
      const done = pressKey(store, event, {
        download,
        open: () => openInput.current?.click(),
        print: () => void print(),
        shortcuts: () => setDialog("shortcuts"),
        shrink: () => {
          if (!full) return false;
          setFull(false);
          return true;
        },
      });
      if (!done) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (document.querySelector("dialog[open]") || !data) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest("input, textarea, select")) return;
      const text = data.getData("text/plain").replace(/\r\n?/g, "\n");
      if (store.hasClip && text === store.clipText) {
        event.preventDefault();
        store.paste(store.view.page);
        return;
      }
      // Cells copied from a sheet come as a picture too: the cells are what is wanted.
      const html = data.getData("text/html");
      const cells = html.includes("<table") ? rowsFromHtml(html) : null;
      const rows = cells?.rows ?? rowsFromText(text);
      if (rows && (rows.length > 1 || rows[0].length > 1)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!pasteCells(store, rows)) tableOf(store, rows, cells?.bold);
        return;
      }
      if (data.files.length > 0 || text.trim() === "") return;
      event.preventDefault();
      const at = spot();
      if (at) store.pasteText(at.page, at.x, at.y, text.trim());
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("paste", onPaste, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("paste", onPaste, true);
    };
  }, [open, store, download, print, full, spot]);

  const selectedPage = useEditor(store, (s) =>
    s.view.selection[0] ? (pageOf(s.doc, s.view.selection[0])?.id ?? null) : null,
  );
  useEffect(() => {
    if (selectedPage && selectedPage !== store.view.page) store.setView({ page: selectedPage });
  }, [selectedPage, store]);

  // ------------------------------------------------------------ what is shown

  const shut = () => setDialog(null);
  const shared = (
    <>
      <input
        ref={openInput}
        type="file"
        accept={OPENS}
        multiple
        className="hidden"
        aria-label="Choose a file"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (store.doc.pages.length > 0) void (files[0] ? openAnother(files) : undefined);
          else void take(files, null);
        }}
      />
      <input
        ref={pageInput}
        type="file"
        accept={OPENS}
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
      <NewDialog store={store} open={dialog === "new"} onClose={shut} />
      <PasswordDialog store={store} />
    </>
  );

  async function openAnother(list: File[]) {
    const files = allowed(list);
    if (files.length === 0) return;
    if (store.view.dirty) await keepDraft(store).catch(() => undefined);
    await store.open(files[0]);
    if (files.length > 1 && store.doc.pages.length > 0) await store.insertFiles(files.slice(1));
  }

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
                Opening your file…
              </p>
            </div>
          ) : (
            <Dropzone
              title="Drop a file to edit it"
              description="PDF, Word, PowerPoint, Excel, pictures and more. Change any text, draw, sign, fill in, and save it as what you need."
              buttonLabel="Choose a file"
              limits={`PDF, DOCX, DOC, ODT, RTF, PPTX, XLSX, TXT, HTML, pictures, up to ${maxSizeMB} MB`}
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
              <span
                className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setDialog("new")}
                  className="inline-flex h-10 items-center gap-2 px-3 text-[14.5px] font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                >
                  <FilePlus size={16} aria-hidden />
                  Start a new document
                </button>
                {draft ? (
                  <span className="inline-flex h-10 items-stretch border border-line-strong bg-panel text-[14px]">
                    <button
                      type="button"
                      data-slot="draft-open"
                      onClick={() =>
                        void openDraft(store).catch((problem: Error) =>
                          store.setView({ opening: false, error: problem.message }),
                        )
                      }
                      className="inline-flex items-center gap-2 px-3 font-medium hover:bg-ink hover:text-white"
                    >
                      <History size={16} aria-hidden />
                      <span className="max-w-[220px] truncate">Go on with {draft.name}</span>
                      <span className="fb-num text-[12px] opacity-60">
                        {new Date(draft.time).toLocaleString(undefined, {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Forget this draft"
                      title="Forget this draft"
                      data-slot="file-remove"
                      onClick={() => {
                        setDraft(null);
                        void forgetDraft().catch(() => undefined);
                      }}
                      className="grid w-10 place-items-center border-l border-line-strong hover:bg-danger hover:text-white"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </span>
                ) : null}
              </span>
            </Dropzone>
          )}
        </StudioStage>
        {shared}
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
        onRail={() => setRail((value) => !value)}
        onImage={() => {
          replacing.current = null;
          imageInput.current?.click();
        }}
        onFind={() => store.setView({ find: { ...store.view.find, open: !store.view.find.open, hits: [] } })}
        onOpen={() => openInput.current?.click()}
        onAddFiles={() => addFiles(store.doc.pages.length)}
        onPrint={() => void print()}
        onDialog={setDialog}
        onDownload={download}
        onClose={() => {
          setFull(false);
          store.close();
          void forgetDraft().catch(() => undefined);
          setDraft(null);
        }}
        spot={spot}
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
            onExtract={(ids) =>
              void saveAs({
                format: "pdf",
                pages: ids.map((id) => store.doc.pages.findIndex((page) => page.id === id)),
                dpi: 150,
                options: {},
              })
            }
            onClose={() => setRail(false)}
            className="max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-[8] max-lg:shadow-[8px_0_0_rgba(24,24,27,0.12)]"
          />
        ) : null}
        <Stage
          store={store}
          queue={queue}
          full={full}
          onFull={() => setFull((value) => !value)}
          onAddFiles={addFiles}
          onDropFiles={(files, place) => void take(files, place)}
        />
      </div>

      <ActionDock pinned={false} className="!px-3 !pb-[max(0.75rem,env(safe-area-inset-bottom))] !pt-3 lg:hidden">
        <div className="h-[56px]">
          <div className="flex h-full">
            <DownloadKey store={store} onClick={download} onFormat={() => setDialog("save")} />
          </div>
        </div>
      </ActionDock>

      <ContextMenu
        store={store}
        onImage={() => {
          replacing.current = null;
          imageInput.current?.click();
        }}
        onAddFiles={addFiles}
      />
      <SignDialog store={store} open={dialog === "sign"} onClose={shut} place={spot} />
      <SaveDialog store={store} open={dialog === "save"} onClose={shut} onSave={(choice) => void saveAs(choice)} />
      <SizeDialog store={store} open={dialog === "size"} onClose={shut} />
      <BandsDialog store={store} open={dialog === "bands"} onClose={shut} />
      <WatermarkDialog store={store} open={dialog === "watermark"} onClose={shut} />
      <PaperDialog store={store} open={dialog === "paper"} onClose={shut} />
      <SymbolsDialog store={store} open={dialog === "symbols"} onClose={shut} place={spot} />
      <CodeDialog store={store} kind="qr" open={dialog === "qr"} onClose={shut} place={spot} />
      <CodeDialog store={store} kind="barcode" open={dialog === "barcode"} onClose={shut} place={spot} />
      <PropertiesDialog store={store} open={dialog === "properties"} onClose={shut} />
      <BookmarksDialog store={store} open={dialog === "bookmarks"} onClose={shut} />
      <ShortcutsDialog open={dialog === "shortcuts"} onClose={shut} />
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
      {shared}
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
        <p className="mt-3 text-[15px] leading-snug text-muted">
          Your changes are kept in this browser, so you can go on with them when you come back.
        </p>
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
