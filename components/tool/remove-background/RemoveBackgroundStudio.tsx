"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import { FileRow, Note, StudioFrame, StudioStage } from "@/components/tool/kit";
import { DropChip, Dropzone } from "@/components/tool/kit/Dropzone";
import { ImageViewer } from "@/components/tool/viewer/ImageViewer";
import { PreviewAction } from "@/components/tool/paid/PreviewAction";
import { RemoverControls } from "./RemoverControls";
import {
  DEFAULT_REMOVER_SETTINGS,
  formatBytes,
  type RemoverSettings,
} from "./model";

export function RemoveBackgroundStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const {
    activeItem,
    error,
    dragging,
    inputRef,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    removeItem,
  } = useImageQueue({ maxFiles: 1, maxSizeMB, noun: "image" });

  const [settings, setSettings] = useState<RemoverSettings>(DEFAULT_REMOVER_SETTINGS);

  function patch(next: Partial<RemoverSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  return (
    <StudioFrame id="remove-background" label="Background removal studio">
      <StudioStage flush>
        <span aria-hidden className="hidden" data-error={error} />

        {!activeItem ? (
          <Dropzone
            title="Drop an image to cut out"
            description="Products, portraits and logos, lifted off their background."
            buttonLabel="Choose an image"
            limits={`JPG, PNG or WebP · up to ${maxSizeMB} MB`}
            note="The image stays in this browser."
            onChoose={() => openPicker()}
            dragging={dragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            chips={
              <>
                <DropChip>Transparent PNG</DropChip>
                <DropChip>Hair and fine edges</DropChip>
                <DropChip>Solid color fills</DropChip>
              </>
            }
          />
        ) : (
          <div
            className="flex min-h-0 flex-1 flex-col"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <FileRow
              flush
              className="border-b border-line"
              icon={<ImageIcon size={17} aria-hidden />}
              name={activeItem.file.name}
              meta={`${formatBytes(activeItem.file.size)}${
                activeItem.width ? ` · ${activeItem.width} × ${activeItem.height} px` : ""
              } · ${settings.format.toUpperCase()} output`}
              onReplace={() => openPicker(activeItem.id)}
              onRemove={() => removeItem(activeItem.id)}
            />
            <ImageViewer
              title={activeItem.file.name}
              before={{
                src: activeItem.preview,
                width: activeItem.width ?? 1,
                height: activeItem.height ?? 1,
                label: "Original",
                note: formatBytes(activeItem.file.size),
                alt: `Source for ${activeItem.file.name}`,
              }}
              dragging={dragging}
              dropLabel="Drop to replace"
            />
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          tabIndex={-1}
          aria-label="Choose an image to remove the background from"
          className="sr-only"
          onChange={onPick}
        />

        {error ? <Note tone="error" className="m-3 shrink-0">{error}</Note> : null}
      </StudioStage>

      <StudioRail
        label="Cutout settings"
        action={<PreviewAction />}
      >
        <div className="space-y-7">
          <RemoverControls settings={settings} onPatch={patch} />
        </div>
      </StudioRail>
    </StudioFrame>
  );
}
