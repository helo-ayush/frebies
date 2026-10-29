import {
  AudioLines,
  Circle,
  Crop,
  Languages,
  Mic,
  Play,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { Tool } from "@/lib/registry/tools";
import {
  ActionBar,
  ChoiceCards,
  Dropzone,
  Field,
  RangeField,
  SelectField,
  TextField,
  Toggle,
  Waveform,
  WorkspaceGrid,
  WorkspaceHistory,
} from "./primitives";

export function ResizeWorkspace({ tool }: { tool: Tool }) {
  return (
    <>
      <WorkspaceGrid
        settings={
          <>
            <ChoiceCards
              label="Mode"
              choices={[
                { value: "resize", title: "Resize", description: "Set exact dimensions" },
                { value: "crop", title: "Crop", description: "Reframe the image" },
              ]}
            />
            <div className="flex gap-2">
              <TextField label="Width" defaultValue="1920" suffix="px" type="number" />
              <TextField label="Height" defaultValue="1080" suffix="px" type="number" />
            </div>
            <SelectField label="Aspect ratio" options={["Freeform", "Original", "1:1", "4:5", "16:9", "9:16"]} defaultValue="Original" />
            <Toggle label="Lock proportions" description="Keep width and height in the same ratio." defaultChecked />
            <SelectField label="Resize method" options={["High quality", "Pixel perfect", "Fast"]} />
            <SelectField label="Output format" options={["Keep original", "PNG", "JPG", "WebP"]} />
          </>
        }
      >
        <Dropzone tool={tool} compact />
        <div className="mt-3 rounded-[12px] border border-line bg-[#fafaf9] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Crop size={15} className="text-muted" aria-hidden />
              <p className="text-ui font-medium">Crop presets</p>
            </div>
            <span className="text-micro text-faint">Choose after adding an image</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
            {["1:1", "4:5", "3:2", "16:9", "9:16", "4:3", "Free"].map((ratio) => (
              <button
                key={ratio}
                type="button"
                disabled
                className="rounded-lg border border-line bg-white px-2 py-2.5 text-micro font-medium text-muted disabled:opacity-60"
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
        <ActionBar tool={tool} label="Resize image" />
      </WorkspaceGrid>
      <WorkspaceHistory tool={tool} />
    </>
  );
}

export function AiPdfWorkspace({ tool }: { tool: Tool }) {
  return (
    <>
      <WorkspaceGrid
        settings={
          <>
            <SelectField label="Edit type" options={["Rewrite selected text", "Find and replace", "Summarize document", "Translate document"]} />
            <SelectField label="Writing tone" options={["Keep original", "Professional", "Friendly", "Concise"]} />
            <SelectField label="Output language" options={["Keep original", "English", "Hindi"]} />
            <Toggle label="Preserve layout" description="Keep fonts, spacing and page structure where possible." defaultChecked />
            <Toggle label="Review changes first" description="Show a before-and-after preview before download." defaultChecked />
            <div className="rounded-[10px] border border-line bg-rail p-3 text-micro leading-relaxed text-muted">
              Complex layouts may need a quick review. The final run cost is always confirmed first.
            </div>
          </>
        }
      >
        <Dropzone tool={tool} compact />
        <div className="mt-3 overflow-hidden rounded-[12px] border border-line bg-white">
          <div className="flex items-center gap-2 border-b border-line-soft px-3.5 py-3">
            <WandSparkles size={14} className="text-accent" aria-hidden />
            <label htmlFor="pdf-prompt" className="text-ui font-semibold">Describe your edit</label>
          </div>
          <textarea
            id="pdf-prompt"
            rows={5}
            placeholder="For example: Update the invoice date to 30 October 2026 and make the payment terms more concise."
            className="w-full resize-none bg-white px-3.5 py-3 text-ui leading-relaxed text-ink outline-none placeholder:text-faint"
          />
          <div className="flex flex-wrap gap-1.5 border-t border-line-soft px-3.5 py-3">
            {["Make it concise", "Fix the details", "Rewrite a clause"].map((suggestion) => (
              <span key={suggestion} className="rounded-full border border-line bg-rail px-2.5 py-1 text-micro text-muted">
                {suggestion}
              </span>
            ))}
          </div>
        </div>
        <ActionBar tool={tool} label="Review edits" />
      </WorkspaceGrid>
      <WorkspaceHistory tool={tool} />
    </>
  );
}

export function AudioTrimWorkspace({ tool }: { tool: Tool }) {
  return (
    <>
      <WorkspaceGrid
        settings={
          <>
            <div className="flex gap-2">
              <TextField label="Start" defaultValue="00:00.000" />
              <TextField label="End" defaultValue="00:30.000" />
            </div>
            <RangeField label="Fade in" defaultValue={0} max={10} suffix="s" />
            <RangeField label="Fade out" defaultValue={0} max={10} suffix="s" />
            <SelectField label="Output format" options={["Keep original", "MP3", "WAV", "M4A"]} />
            <Toggle label="Avoid re-encoding" description="Cut at compatible frame boundaries for a faster export." defaultChecked />
            <Toggle label="Normalize volume" />
          </>
        }
      >
        <Dropzone tool={tool} compact />
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between text-micro text-faint">
            <span>00:00</span><span>00:15</span><span>00:30</span>
          </div>
          <Waveform label="Trim timeline placeholder" />
          <div className="mt-2 flex items-center gap-3 rounded-[11px] border border-line bg-white px-3 py-2.5">
            <button
              type="button"
              disabled
              aria-label="Play audio preview"
              className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white disabled:opacity-40"
            >
              <Play size={13} fill="currentColor" aria-hidden />
            </button>
            <span className="text-micro tabular-nums text-muted">00:00.000 / 00:30.000</span>
            <span className="ml-auto rounded-md bg-rail px-2 py-1 text-micro text-faint">Preview</span>
          </div>
        </div>
        <ActionBar tool={tool} label="Trim audio" />
      </WorkspaceGrid>
      <WorkspaceHistory tool={tool} />
    </>
  );
}

export function TextToSpeechWorkspace({ tool }: { tool: Tool }) {
  return (
    <>
      <WorkspaceGrid
        settings={
          <>
            <SelectField label="Voice" options={["Aria — warm and natural", "Rohan — clear narrator", "Mira — calm and expressive", "Dev — grounded and conversational"]} />
            <div className="rounded-[11px] border border-line bg-white p-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffe2d6_0%,#c99a91_45%,#735a6b_100%)] text-white">
                  <AudioLines size={17} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-ui font-medium">Aria</p>
                  <p className="text-micro text-faint">Warm · Natural · English</p>
                </div>
                <button type="button" disabled aria-label="Preview Aria voice" className="grid h-8 w-8 place-items-center rounded-full border border-line disabled:opacity-40">
                  <Play size={12} fill="currentColor" aria-hidden />
                </button>
              </div>
            </div>
            <SelectField label="Model" options={["Natural v1", "Fast draft", "Multilingual"]} />
            <RangeField label="Speed" defaultValue={50} suffix="%" left="Slower" right="Faster" />
            <RangeField label="Stability" defaultValue={65} left="Expressive" right="Consistent" />
            <SelectField label="Output format" options={["MP3 · 192 kbps", "MP3 · 320 kbps", "WAV"]} />
            <Toggle label="Speaker boost" description="Improve clarity and presence in the generated voice." defaultChecked />
          </>
        }
      >
        <div className="overflow-hidden rounded-[13px] border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <div className="flex items-center gap-1 rounded-lg bg-rail p-1">
              <span className="rounded-md border border-line bg-white px-3 py-1.5 text-micro font-medium text-ink">Single voice</span>
              <span className="px-3 py-1.5 text-micro font-medium text-faint">Dialogue</span>
            </div>
            <span className="text-micro text-faint">0 / 10,000</span>
          </div>
          <label htmlFor="speech-text" className="sr-only">Text to turn into speech</label>
          <textarea
            id="speech-text"
            rows={11}
            placeholder="Start typing or paste your script here…"
            className="min-h-[280px] w-full resize-none bg-white px-4 py-4 text-[15px] leading-7 text-ink outline-none placeholder:text-faint"
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3 text-micro text-faint">
            <Languages size={13} aria-hidden />
            <span>English (auto detect)</span>
            <span className="ml-auto">Estimated duration: —</span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-[11px] border border-line bg-[#fdfdfc] px-3.5 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#fff2ec] text-accent">
            <Sparkles size={14} aria-hidden />
          </span>
          <p className="text-micro leading-relaxed text-muted">
            Add paragraphs and pauses to shape the delivery. Your script stays here while you explore voices.
          </p>
        </div>
        <ActionBar tool={tool} label="Generate speech" note="1 credit per generation · 25 free credits on sign-up" />
      </WorkspaceGrid>
      <WorkspaceHistory tool={tool} />
    </>
  );
}

export function SpeechToTextWorkspace({ tool }: { tool: Tool }) {
  return (
    <>
      <WorkspaceGrid
        settings={
          <>
            <SelectField label="Spoken language" options={["Auto detect", "English", "Hindi", "English + Hindi"]} />
            <SelectField label="Model" options={["Accurate", "Fast", "Realtime-ready"]} />
            <RangeField label="Maximum speakers" defaultValue={4} min={1} max={10} suffix="" />
            <Toggle label="Speaker labels" description="Label different voices as Speaker 1, Speaker 2 and so on." defaultChecked />
            <Toggle label="Word timestamps" description="Include precise timing for each recognized word." defaultChecked />
            <Toggle label="Smart formatting" description="Add punctuation, paragraphs and number formatting." defaultChecked />
            <SelectField label="Download format" options={["Text (.txt)", "Subtitles (.srt)", "Detailed JSON"]} />
          </>
        }
      >
        <Dropzone tool={tool} compact />
        <div className="my-3 flex items-center gap-3 text-micro text-faint">
          <span className="h-px flex-1 bg-line" /><span>or</span><span className="h-px flex-1 bg-line" />
        </div>
        <div className="flex flex-col items-center rounded-[12px] border border-line bg-[#fafaf9] px-5 py-6 text-center">
          <span className="relative grid h-12 w-12 place-items-center rounded-full bg-ink text-white">
            <Mic size={19} strokeWidth={1.5} aria-hidden />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-accent" />
          </span>
          <p className="mt-3 text-ui font-semibold">Record something new</p>
          <p className="mt-1 text-micro text-faint">Use your microphone and transcribe the recording.</p>
          <button
            type="button"
            disabled
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-4 text-ui font-medium disabled:opacity-50"
          >
            <Circle size={10} fill="currentColor" className="text-accent" aria-hidden />
            Start recording
          </button>
        </div>
        <ActionBar tool={tool} label="Transcribe audio" />
      </WorkspaceGrid>
      <WorkspaceHistory tool={tool} />
    </>
  );
}
