"use client";

import { useEffect, useRef } from "react";

/**
 * Files can land anywhere: dropped on any part of the page, or pasted with
 * Ctrl V. Also stops the browser from leaving the tool to open a file that
 * missed the drop area.
 */
export function useFileIntake(
  accept: (files: FileList) => void,
  setDragging: (dragging: boolean) => void,
  enabled = true,
) {
  const latest = useRef({ accept, setDragging });
  latest.current = { accept, setDragging };

  useEffect(() => {
    if (!enabled) return;
    // A drag that began on this page (reordering) is not a file coming in.
    let internal = false;
    const carriesFiles = (event: DragEvent) =>
      !internal && Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const blocked = () => Boolean(document.querySelector("dialog[open]"));

    const onStart = () => {
      internal = true;
    };
    const onEnd = () => {
      internal = false;
    };
    const onOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (!blocked()) latest.current.setDragging(true);
    };
    const onLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) latest.current.setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      const files = carriesFiles(event);
      internal = false;
      if (!files) return;
      const handled = event.defaultPrevented;
      event.preventDefault();
      latest.current.setDragging(false);
      if (handled || blocked() || !event.dataTransfer?.files.length) return;
      latest.current.accept(event.dataTransfer.files);
    };
    const onPaste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files;
      if (!files?.length || blocked()) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable=true]")) return;
      event.preventDefault();
      latest.current.accept(files);
    };

    window.addEventListener("dragstart", onStart, true);
    window.addEventListener("dragend", onEnd, true);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragstart", onStart, true);
      window.removeEventListener("dragend", onEnd, true);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [enabled]);
}
