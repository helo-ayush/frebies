"use client";

import { ChevronDown, UploadCloud } from "lucide-react";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { Btn, Reveal } from "@/components/ui";

const sidebarTools = [
  { name: "Image Converter", path: "/image/convert" },
  { name: "Image Compressor", path: "/image/compress" },
  { name: "Resize & Crop", path: "/image/resize" },
  { name: "Image Upscaler", path: "/image/upscaler" },
];

export function WorkbenchPreview() {
  return (
    <section id="workspace" className="mx-auto mt-28 max-w-[1280px] scroll-mt-24 px-5">
      <Reveal className="grid gap-6 md:grid-cols-2 md:items-end">
        <div>
          <p className="mb-4 text-lg text-muted">The workbench</p>
          <h2 className="text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.04] tracking-[-0.035em]">
            One calm place for every small job.
          </h2>
        </div>
        <div>
          <p className="max-w-xl text-lg leading-snug">
            No tab graveyard or mystery menus. Every tool opens into the same focused
            workspace, with the controls, history and privacy notes where you expect them.
          </p>
          <div className="mt-6">
            <Btn href="/dashboard">Explore all 16 tools</Btn>
          </div>
        </div>
      </Reveal>

      <Reveal className="mt-12">
        <div className="relative overflow-hidden rounded-[32px] border border-line bg-[#f1efeb] px-2 py-2 md:p-7">
          <div
            aria-hidden="true"
            className="relative overflow-hidden rounded-[22px] border border-white/70 bg-white shadow-[0_28px_80px_rgba(25,20,12,0.14)]"
          >
            <div className="flex h-10 items-center gap-1.5 border-b border-line bg-[#fafafa] px-4">
              <span className="h-2 w-2 rounded-full bg-[#dededb]" />
              <span className="h-2 w-2 rounded-full bg-[#dededb]" />
              <span className="h-2 w-2 rounded-full bg-[#dededb]" />
              <span className="mx-auto rounded-md border border-line bg-white px-5 py-1 text-[9px] text-faint sm:px-16">
                frebies / image / convert
              </span>
              <span className="w-5 sm:w-10" />
            </div>

            <div className="grid min-h-[390px] md:grid-cols-[190px_minmax(0,1fr)]">
              <div className="hidden border-r border-line bg-[#fafafa] p-4 md:block">
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-ink">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                  <span className="text-[11px] font-semibold">frebies</span>
                </div>

                <div className="mt-5 space-y-1">
                  <div className="rounded-[7px] bg-[#efefed] px-2.5 py-2 text-[10px] font-medium">Home</div>
                  <div className="px-2.5 py-2 text-[10px] text-muted">All tools</div>
                </div>

                <p className="mt-6 px-2 text-[9px] font-medium text-faint">Images</p>
                <div className="mt-2 space-y-1">
                  {sidebarTools.map((tool, index) => (
                    <div
                      key={tool.path}
                      className={`flex items-center gap-2 rounded-[7px] px-2 py-2 text-[10px] ${
                        index === 0 ? "bg-[#efefed] font-medium text-ink" : "text-muted"
                      }`}
                    >
                      <ToolGlyph path={tool.path} size={13} />
                      <span className="truncate">{tool.name}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-8 rounded-[10px] border border-line bg-white p-2.5">
                  <p className="text-[9px] font-medium">25 free credits</p>
                  <p className="mt-1 text-[8px] leading-relaxed text-faint">
                    For AI tools when you sign in.
                  </p>
                </div>
              </div>

              <div className="min-w-0 p-4 sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[9px] text-faint">Image tools / Workspace</p>
                    <h3 className="mt-1.5 font-display text-[22px] font-semibold tracking-[-0.025em] sm:text-[26px]">
                      Image Converter
                    </h3>
                    <p className="mt-1 text-[11px] text-muted">
                      Convert JPG, PNG and WebP without uploading a thing.
                    </p>
                  </div>
                  <span className="rounded-full border border-line px-2 py-1 text-[8px] text-muted">
                    Free
                  </span>
                </div>

                <div className="mt-5 grid overflow-hidden rounded-[13px] border border-line md:grid-cols-[minmax(0,1fr)_190px]">
                  <div className="p-3 sm:p-4">
                    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[10px] border border-dashed border-[#d5d5d1] bg-[#fafaf9] px-4 text-center sm:min-h-[240px]">
                      <span className="grid h-10 w-10 place-items-center rounded-[10px] border border-line bg-white text-muted">
                        <UploadCloud size={18} strokeWidth={1.4} />
                      </span>
                      <p className="mt-3 text-[11px] font-medium">Drop your image here</p>
                      <p className="mt-1 text-[9px] text-faint">
                        JPG, PNG or WebP · up to 25 MB
                      </p>
                      <span className="mt-3 rounded-[6px] border border-line bg-white px-3 py-1.5 text-[9px] font-medium">
                        Choose image
                      </span>
                    </div>
                  </div>

                  <div className="hidden border-l border-line bg-[#fdfdfc] p-4 md:block">
                    <p className="text-[10px] font-semibold">Settings</p>
                    <p className="mt-5 text-[9px] font-medium">Output format</p>
                    <div className="mt-1.5 flex items-center justify-between rounded-[6px] border border-line bg-white px-2.5 py-2 text-[9px]">
                      WebP <ChevronDown size={9} />
                    </div>
                    <div className="mt-4 flex justify-between text-[9px]">
                      <span>Quality</span>
                      <span className="text-faint">90%</span>
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-[#e5e5e2]">
                      <div className="h-full w-[90%] rounded-full bg-ink" />
                    </div>
                    <div className="mt-5 rounded-[7px] bg-rail p-2 text-[8px] leading-relaxed text-muted">
                      Your file stays on this device.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
