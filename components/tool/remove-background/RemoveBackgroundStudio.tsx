"use client";

import { useState } from "react";
import { Eraser, ImageIcon } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import {
  Chip,
  FileRow,
  Note,
  STAGE_LABEL,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import { DropChip, Dropzone } from "@/components/tool/kit/Dropzone";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { NotConnectedNote, PaidRunCard } from "@/components/tool/paid/PaidRunCard";
import { RemoverControls } from "./RemoverControls";
import {
  DEFAULT_REMOVER_SETTINGS,
  REMOVER_COST,
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
  const [gateOpen, setGateOpen] = useState(false);

  function patch(next: Partial<RemoverSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  return (
    <>
      <StudioFrame id="remove-background" label="Background removal studio">
        <StudioStage>
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
              icon={<Eraser size={27} strokeWidth={1.5} aria-hidden />}
              chips={
                <>
                  <DropChip>Transparent PNG</DropChip>
                  <DropChip>Hair and fine edges</DropChip>
                  <DropChip>Solid colour fills</DropChip>
                </>
              }
            />
          ) : (
            <div
              className="flex min-h-0 flex-1 flex-col gap-3"
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <span className={STAGE_LABEL}>Original image</span>
                {activeItem.width ? (
                  <Chip>
                    {activeItem.width} × {activeItem.height} px
                  </Chip>
                ) : null}
              </div>

              <div
                className={`flex min-h-[260px] flex-1 items-center justify-center overflow-hidden rounded-[16px] border bg-[#f3f1ec] p-3 transition-colors sm:p-5 lg:min-h-0 ${
                  dragging ? "border-accent" : "border-line"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeItem.preview}
                  alt={`Source for ${activeItem.file.name}`}
                  draggable={false}
                  className="max-h-[70vh] max-w-full select-none rounded-[8px] object-contain shadow-[0_14px_34px_-16px_rgba(15,15,16,0.4)] lg:max-h-full"
                />
              </div>

              <FileRow
                icon={<ImageIcon size={16} aria-hidden />}
                name={activeItem.file.name}
                meta={`${formatBytes(activeItem.file.size)} · ${settings.format.toUpperCase()} output`}
                onReplace={() => openPicker(activeItem.id)}
                onRemove={() => removeItem(activeItem.id)}
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

          {error ? (
            <Note tone="error" className="mt-3 shrink-0">
              {error}
            </Note>
          ) : null}
        </StudioStage>

        <StudioRail
          label="Cutout settings"
          action={
            <PaidRunCard
              cost={REMOVER_COST}
              verb="cut out"
              ready={Boolean(activeItem)}
              onRun={() => setGateOpen(true)}
              emptyLabel="Add an image to cut out"
              hint={`${REMOVER_COST} credit per image · new accounts get 25 free`}
            />
          }
        >
          <div className="space-y-6">
            <NotConnectedNote />
            <RemoverControls settings={settings} onPatch={patch} />
          </div>
        </StudioRail>
      </StudioFrame>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="remove this background"
        cost={REMOVER_COST}
      />
    </>
  );
}
