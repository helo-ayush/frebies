"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Filmstrip } from "./Filmstrip";
import { ImageViewer } from "./ImageViewer";

/** Full-window modal with a title bar. Native dialog, so focus stays inside. */
export function Lightbox({
  open,
  onClose,
  title,
  meta,
  actions,
  children,
  onKey,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Return true when the key was handled. */
  onKey?: (key: string) => boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => closeRef.current();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={typeof title === "string" ? title : "Viewer"}
      onKeyDown={(event) => {
        if (onKey?.(event.key)) event.preventDefault();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-canvas p-0 text-ink open:flex open:flex-col"
    >
      {open ? (
        <>
          <div className="fb-result shrink-0 bg-ink text-white">
            <div className="flex min-h-[60px] flex-wrap items-stretch">
              <div className="flex min-w-[120px] flex-1 flex-col justify-center px-5 py-2.5">
                <p className="truncate text-[15px] font-semibold">{title}</p>
                {meta ? <p className="fb-num truncate text-[13px] text-white/60">{meta}</p> : null}
              </div>
              {actions}
              <button
                type="button"
                onClick={() => ref.current?.close()}
                aria-label="Close viewer"
                data-slot="viewer-close"
                className="grid w-[60px] place-items-center border-l border-white/15 transition-colors hover:bg-white hover:text-ink"
              >
                <X size={19} aria-hidden />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </>
      ) : null}
    </dialog>
  );
}

export type LightboxImage = {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  note?: string;
};

/** A set of pictures at full size, with a strip to move between them. */
export function ImageLightbox({
  images,
  index,
  onIndex,
  onClose,
  actions,
}: {
  images: readonly LightboxImage[];
  /** Null when closed. */
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
  actions?: (image: LightboxImage) => ReactNode;
}) {
  const image = index === null ? null : images[index];
  const step = (delta: number) => {
    if (index === null) return false;
    const next = index + delta;
    if (next < 0 || next >= images.length) return false;
    onIndex(next);
    return true;
  };

  return (
    <Lightbox
      open={Boolean(image)}
      onClose={onClose}
      title={image?.name ?? "Image"}
      meta={
        image ? `${index! + 1} of ${images.length} · ${image.width} × ${image.height} px${image.note ? ` · ${image.note}` : ""}` : undefined
      }
      actions={image ? actions?.(image) : undefined}
      onKey={(key) => (key === "ArrowLeft" ? step(-1) : key === "ArrowRight" ? step(1) : false)}
    >
      {image ? (
        <>
          <ImageViewer
            before={{ src: image.src, width: image.width, height: image.height, label: image.name, alt: image.name }}
            title={image.name}
            inDialog
          />
          {images.length > 1 ? (
            <Filmstrip
              label="Images"
              activeId={image.id}
              onSelect={(id) => onIndex(images.findIndex((item) => item.id === id))}
              items={images.map((item, at) => ({
                id: item.id,
                name: item.name,
                src: item.src,
                badge: String(at + 1).padStart(2, "0"),
              }))}
            />
          ) : null}
        </>
      ) : null}
    </Lightbox>
  );
}
