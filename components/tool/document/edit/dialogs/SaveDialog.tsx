"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FileCode, FileImage, FileSpreadsheet, FileText, FileType, Presentation } from "lucide-react";
import { parsePages } from "../engine/decor";
import { useEditor, type EditorStore, type Format, type SaveOptions } from "../store";
import { Choice, Part, Sheet, Tick } from "./Sheet";

export type SaveChoice = {
  format: Format;
  /** Pages from 0. Null for all of them. */
  pages: number[] | null;
  dpi: number;
  options: SaveOptions;
};

const ICON = { size: 20, strokeWidth: 1.5, "aria-hidden": true } as const;

const FORMATS: { value: Format; label: string; hint: string; icon: ReactNode }[] = [
  { value: "pdf", label: "PDF", hint: "Exactly as you see it", icon: <FileType {...ICON} /> },
  { value: "docx", label: "Word", hint: ".docx", icon: <FileText {...ICON} /> },
  { value: "odt", label: "OpenDocument", hint: ".odt", icon: <FileText {...ICON} /> },
  { value: "rtf", label: "Rich text", hint: ".rtf, opens in any Word", icon: <FileText {...ICON} /> },
  { value: "pptx", label: "PowerPoint", hint: ".pptx, a slide per page", icon: <Presentation {...ICON} /> },
  { value: "xlsx", label: "Excel", hint: ".xlsx, the tables", icon: <FileSpreadsheet {...ICON} /> },
  { value: "png", label: "PNG", hint: "Pictures of the pages", icon: <FileImage {...ICON} /> },
  { value: "jpg", label: "JPG", hint: "Smaller pictures", icon: <FileImage {...ICON} /> },
  { value: "webp", label: "WebP", hint: "The smallest pictures", icon: <FileImage {...ICON} /> },
  { value: "html", label: "Web page", hint: ".html", icon: <FileCode {...ICON} /> },
  { value: "md", label: "Markdown", hint: ".md", icon: <FileCode {...ICON} /> },
  { value: "txt", label: "Plain text", hint: ".txt", icon: <FileText {...ICON} /> },
];

const ALLOW: { key: keyof NonNullable<SaveOptions["protect"]>["allow"]; label: string }[] = [
  { key: "print", label: "Printing" },
  { key: "copy", label: "Copying text" },
  { key: "change", label: "Changing it" },
  { key: "comment", label: "Comments" },
  { key: "fill", label: "Filling in forms" },
];

type Pages = "all" | "here" | "picked" | "list";

/** Which kind of file, which pages, and how. */
export function SaveDialog({
  store,
  open,
  onClose,
  onSave,
}: {
  store: EditorStore;
  open: boolean;
  onClose: () => void;
  onSave: (choice: SaveChoice) => void;
}) {
  const format = useEditor(store, (s) => s.view.format);
  const pages = useEditor(store, (s) => s.doc.pages);
  const marked = useEditor(store, (s) => s.view.marked);
  const current = useEditor(store, (s) => s.view.page);
  const [which, setWhich] = useState<Pages>("all");
  const [list, setList] = useState("");
  const [shrink, setShrink] = useState<"off" | "light" | "medium" | "strong">("off");
  const [flatten, setFlatten] = useState(false);
  const [lock, setLock] = useState(false);
  const [openWord, setOpenWord] = useState("");
  const [owner, setOwner] = useState("");
  const [allow, setAllow] = useState({ print: true, copy: true, change: false, comment: true, fill: true });
  const [dpi, setDpi] = useState("150");

  useEffect(() => {
    if (!open) return;
    setWhich(store.view.marked.length > 1 ? "picked" : "all");
  }, [open, store]);

  const at = Math.max(
    0,
    pages.findIndex((page) => page.id === current),
  );
  const chosen = (): number[] | null => {
    if (which === "here") return [at];
    if (which === "picked") return pages.flatMap((page, i) => (marked.includes(page.id) ? [i] : []));
    if (which === "list") return parsePages(list, pages.length);
    return null;
  };
  const picture = format === "png" || format === "jpg" || format === "webp";
  const count = chosen()?.length ?? pages.length;
  const listBad = which === "list" && count === 0;
  const lockBad = lock && openWord === "" && owner === "";
  const protect: SaveOptions["protect"] =
    format === "pdf" && lock && !lockBad
      ? // Without a word of its own the owner's is the one that opens it.
        { open: openWord || undefined, owner: owner || openWord, allow }
      : undefined;

  return (
    <Sheet
      title="Download as"
      open={open}
      onClose={onClose}
      width={760}
      foot={
        <button
          type="button"
          disabled={listBad || lockBad}
          data-slot="save-as"
          onClick={() => {
            onClose();
            onSave({
              format,
              pages: chosen(),
              dpi: Number(dpi),
              options: {
                flatten: format === "pdf" && flatten ? true : undefined,
                shrink: format === "pdf" && shrink !== "off" ? shrink : undefined,
                protect,
              },
            });
          }}
          className="fb-btn w-full"
        >
          {picture && count > 1
            ? `Download ${count} pictures in a zip`
            : `Download ${FORMATS.find((item) => item.value === format)?.label ?? ""}`}
        </button>
      }
    >
      <Part>
        <div role="group" aria-label="Kind of file" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FORMATS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={format === item.value}
              data-sound="select"
              onClick={() => store.setView({ format: item.value })}
              className={`flex items-center gap-2.5 border px-3 py-2.5 text-left ${
                format === item.value ? "border-ink bg-ink text-white" : "border-line-strong bg-white hover:border-ink"
              }`}
            >
              {item.icon}
              <span className="min-w-0">
                <span className="block text-[14px] leading-tight">{item.label}</span>
                <span
                  className={`block truncate text-[11.5px] leading-tight ${format === item.value ? "text-white/65" : "text-muted"}`}
                >
                  {item.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Part>
      <Part title="Pages">
        <Choice<Pages>
          label="Which pages"
          value={which}
          onChange={setWhich}
          options={[
            { value: "all", label: `All ${pages.length}` },
            { value: "here", label: `Page ${at + 1}` },
            ...(marked.length > 1 ? [{ value: "picked" as Pages, label: `${marked.length} picked` }] : []),
            { value: "list", label: "Some" },
          ]}
        />
        {which === "list" ? (
          <input
            value={list}
            autoFocus
            aria-label="Pages"
            placeholder={`1-3, 5, ${pages.length}`}
            onChange={(event) => setList(event.target.value)}
            className="fb-input mt-2 !h-10 max-w-[280px]"
          />
        ) : null}
      </Part>
      {picture ? (
        <Part title="Sharpness">
          <Choice
            label="Sharpness"
            value={dpi}
            onChange={setDpi}
            options={[
              { value: "96", label: "Screen (96 dpi)" },
              { value: "150", label: "Good (150 dpi)" },
              { value: "300", label: "Print (300 dpi)" },
            ]}
          />
        </Part>
      ) : null}
      {format === "pdf" ? (
        <>
          <Part title="File size">
            <Choice
              label="File size"
              value={shrink}
              onChange={setShrink}
              options={[
                { value: "off", label: "Full quality" },
                { value: "light", label: "A bit smaller" },
                { value: "medium", label: "Smaller" },
                { value: "strong", label: "Smallest" },
              ]}
            />
            {shrink === "off" ? null : (
              <p className="mt-2 text-[13px] text-muted">Pictures are made smaller. Text and lines stay sharp.</p>
            )}
          </Part>
          <Part title="Options">
            <Tick checked={flatten} onChange={setFlatten}>
              Make forms part of the page, so answers cannot be changed
            </Tick>
            <Tick checked={lock} onChange={setLock}>
              Lock it with a password
            </Tick>
            {lock ? (
              <div className="mt-2 border border-line bg-canvas p-3.5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-[13px] text-muted">
                    Password to open it
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={openWord}
                      onChange={(event) => setOpenWord(event.target.value)}
                      className="fb-input mt-1.5 !h-10"
                    />
                  </label>
                  <label className="text-[13px] text-muted">
                    Password to change it
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={owner}
                      onChange={(event) => setOwner(event.target.value)}
                      className="fb-input mt-1.5 !h-10"
                    />
                  </label>
                </div>
                <p className="mb-1.5 mt-3 text-[13px] text-muted">Allowed without the second password</p>
                <div className="flex flex-wrap gap-x-5">
                  {ALLOW.map(({ key, label }) => (
                    <Tick
                      key={key}
                      checked={allow[key]}
                      onChange={(value) => setAllow((now) => ({ ...now, [key]: value }))}
                    >
                      {label}
                    </Tick>
                  ))}
                </div>
                <p className="mt-2 text-[12.5px] leading-snug text-muted">
                  Keep the password safe: without it nobody can open the file again, and it is not stored anywhere.
                </p>
              </div>
            ) : null}
          </Part>
        </>
      ) : null}
      {format === "docx" ||
      format === "odt" ||
      format === "rtf" ||
      format === "html" ||
      format === "md" ||
      format === "txt" ? (
        <p className="px-5 py-4 text-[13px] leading-snug text-muted">
          Words, lists, tables and pictures come along as text that flows. Drawings and exact places are kept as far as
          the kind of file allows.
        </p>
      ) : null}
    </Sheet>
  );
}
