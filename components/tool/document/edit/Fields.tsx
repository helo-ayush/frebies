"use client";

import type { CSSProperties } from "react";
import type { Page } from "./model";
import { useEditor, type EditorStore, type PageField } from "./store";

/** A fillable field of the file. */
export function Field({ store, page, field }: { store: EditorStore; page: Page; field: PageField }) {
  const key = `${page.source}:${field.name}`;
  const value = useEditor(store, (s) => s.doc.values[key]) ?? field.value;
  const tool = useEditor(store, (s) => s.view.tool);
  const set = (next: string | boolean) => store.setValue(page.source as string, field.name, next);
  const style: CSSProperties = { left: field.box.x, top: field.box.y, width: field.box.w, height: field.box.h };
  const size =
    field.size > 0 ? field.size : Math.max(6, Math.min(field.kind === "multiline" ? 11 : 14, field.box.h * 0.62));
  const look = `pointer-events-auto absolute m-0 rounded-none border border-[#8fb3c9] bg-[#e4f1f8]/90 p-0 text-ink outline-none focus:border-ink focus:bg-white ${
    tool === "select" ? "" : "!pointer-events-none"
  }`;
  const common = { "aria-label": field.name, disabled: field.readOnly, title: field.name };
  if (field.kind === "check") {
    return (
      <input
        type="checkbox"
        {...common}
        checked={Boolean(value)}
        onChange={(event) => set(event.target.checked)}
        className={`${look} accent-[#1d1c1f]`}
        style={style}
      />
    );
  }
  if (field.kind === "radio") {
    return (
      <input
        type="radio"
        {...common}
        name={`${page.id}-${field.name}`}
        checked={value === field.option}
        onChange={() => set(field.option ?? "")}
        className={`${look} accent-[#1d1c1f]`}
        style={style}
      />
    );
  }
  if (field.kind === "list") {
    return (
      <select
        {...common}
        value={String(value)}
        onChange={(event) => set(event.target.value)}
        className={`${look} px-0.5`}
        style={{ ...style, fontSize: size }}
      >
        {!field.options.includes(String(value)) ? <option value={String(value)}>{String(value)}</option> : null}
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === "multiline") {
    return (
      <textarea
        {...common}
        value={String(value)}
        onChange={(event) => set(event.target.value)}
        className={`${look} resize-none px-1 py-0.5 leading-[1.2]`}
        style={{ ...style, fontSize: size }}
      />
    );
  }
  return (
    <input
      type="text"
      {...common}
      value={String(value)}
      onChange={(event) => set(event.target.value)}
      className={`${look} px-1`}
      style={{ ...style, fontSize: size }}
    />
  );
}
