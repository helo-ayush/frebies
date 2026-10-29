import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Clock3,
  FileUp,
  History,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
} from "lucide-react";
import type { Tool } from "@/lib/registry/tools";
import { buttonClasses } from "@/components/ui/Button";

export function PreviewNotice() {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-[#ece5d8] bg-[#fdfbf6] px-3 py-2 text-micro text-[#6f5b3d]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#c38b47]" />
      Interface preview — file processing and AI runs are not connected yet.
    </div>
  );
}

export function WorkspaceGrid({
  children,
  settings,
}: {
  children: ReactNode;
  settings: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-white">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 p-4 sm:p-5">{children}</div>
        <aside className="border-t border-line bg-[#fdfdfc] p-4 sm:p-5 lg:border-l lg:border-t-0">
          <div className="mb-5 flex items-center gap-2 border-b border-line-soft pb-3">
            <SlidersHorizontal size={14} className="text-muted" aria-hidden />
            <h2 className="text-ui font-semibold">Settings</h2>
          </div>
          <div className="space-y-5">{settings}</div>
        </aside>
      </div>
    </div>
  );
}

export function Dropzone({
  tool,
  multiple = false,
  compact = false,
  checkerboard = false,
}: {
  tool: Tool;
  multiple?: boolean;
  compact?: boolean;
  checkerboard?: boolean;
}) {
  const Icon = tool.icon;
  const noun = tool.category === "audio" ? "audio file" : tool.category === "document" ? "file" : "image";
  const limits = [
    tool.limits.formats.join(", "),
    tool.limits.maxSizeMB ? `up to ${tool.limits.maxSizeMB} MB` : null,
    tool.limits.maxPages ? `up to ${tool.limits.maxPages} pages` : null,
    tool.limits.maxDurationMin ? `up to ${tool.limits.maxDurationMin} min` : null,
  ].filter(Boolean);

  return (
    <div
      className={`relative flex ${compact ? "min-h-[210px]" : "min-h-[320px]"} flex-col items-center justify-center overflow-hidden rounded-[13px] border border-dashed border-[#d7d7d3] px-5 py-8 text-center ${
        checkerboard ? "checkerboard" : "bg-[#fafaf9]"
      }`}
    >
      <span className="grid h-12 w-12 place-items-center rounded-[13px] border border-line bg-white text-muted shadow-[0_2px_8px_rgba(15,15,16,0.04)]">
        <UploadCloud size={22} strokeWidth={1.45} aria-hidden />
      </span>
      <p className="mt-4 text-sm font-semibold tracking-[-0.01em] text-ink">
        Drop {multiple ? "files" : `your ${noun}`} here
      </p>
      <p className="mt-1.5 text-ui text-muted">or choose from your device</p>
      <button
        type="button"
        disabled
        title="File selection will be connected with the processing engine"
        className={buttonClasses("secondary", "md", "mt-5")}
      >
        <FileUp size={14} aria-hidden />
        Choose {multiple ? "files" : noun}
      </button>
      <p className="mt-4 max-w-sm text-micro leading-relaxed text-faint">{limits.join(" · ")}</p>
      <span className="absolute bottom-3 right-3 grid h-7 w-7 place-items-center rounded-lg border border-line/80 bg-white/80 text-faint">
        <Icon size={13} strokeWidth={1.5} aria-hidden />
      </span>
    </div>
  );
}

export function ActionBar({
  tool,
  label,
  note,
}: {
  tool: Tool;
  label: string;
  note?: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
      <p className="flex items-center gap-1.5 text-micro text-faint">
        {tool.tier === "credits" ? <Lock size={11} aria-hidden /> : <ShieldCheck size={12} aria-hidden />}
        {note ??
          (tool.tier === "credits"
            ? `${tool.creditCost} ${tool.creditCost === 1 ? "credit" : "credits"} per run · failed runs refunded`
            : "Free · no account · no watermark")}
      </p>
      <button
        type="button"
        disabled
        title="This action is disabled in the interface preview"
        className={buttonClasses("primary", "md", "min-w-[132px]")}
      >
        {tool.tier === "credits" && <Lock size={12} aria-hidden />}
        {label}
        <ArrowUpRight size={13} aria-hidden />
      </button>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-ui font-medium text-ink">{label}</span>
        {hint && <span className="text-micro text-faint">{hint}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function SelectField({
  label,
  options,
  defaultValue,
  hint,
}: {
  label: string;
  options: string[];
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <label className="relative block">
        <span className="sr-only">{label}</span>
        <select
          defaultValue={defaultValue ?? options[0]}
          className="h-9 w-full appearance-none rounded-[9px] border border-line bg-white px-3 pr-8 text-ui text-ink outline-none hover:border-[#d5d5d1] focus:border-[#bbbbb6]"
        >
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
        <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
      </label>
    </Field>
  );
}

export function TextField({
  label,
  defaultValue,
  suffix,
  type = "text",
}: {
  label: string;
  defaultValue: string;
  suffix?: string;
  type?: string;
}) {
  return (
    <label className="block flex-1">
      <span className="text-ui font-medium text-ink">{label}</span>
      <span className="relative mt-2 block">
        <input
          type={type}
          defaultValue={defaultValue}
          className="h-9 w-full rounded-[9px] border border-line bg-white px-3 pr-10 text-ui text-ink outline-none focus:border-[#bbbbb6]"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-micro text-faint">{suffix}</span>}
      </span>
    </label>
  );
}

export function RangeField({
  label,
  defaultValue,
  min = 0,
  max = 100,
  suffix = "%",
  left,
  right,
}: {
  label: string;
  defaultValue: number;
  min?: number;
  max?: number;
  suffix?: string;
  left?: string;
  right?: string;
}) {
  return (
    <Field label={label} hint={`${defaultValue}${suffix}`}>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        defaultValue={defaultValue}
        className="h-1.5 w-full cursor-pointer accent-[#171717]"
      />
      {(left || right) && (
        <div className="mt-1.5 flex justify-between text-micro text-faint"><span>{left}</span><span>{right}</span></div>
      )}
    </Field>
  );
}

export function Toggle({
  label,
  description,
  defaultChecked = false,
}: {
  label: string;
  description?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-ui font-medium text-ink">{label}</span>
        {description && <span className="mt-1 block text-micro leading-relaxed text-faint">{description}</span>}
      </span>
      <input type="checkbox" defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d8d5] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      />
    </label>
  );
}

export function ChoiceCards({
  label,
  choices,
  defaultChoice,
}: {
  label: string;
  choices: { value: string; title: string; description?: string }[];
  defaultChoice?: string;
}) {
  return (
    <fieldset>
      <legend className="text-ui font-medium text-ink">{label}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {choices.map((choice) => (
          <label key={choice.value} className="relative cursor-pointer">
            <input
              type="radio"
              name={label}
              value={choice.value}
              defaultChecked={choice.value === (defaultChoice ?? choices[0].value)}
              className="peer sr-only"
            />
            <span className="block min-h-[58px] rounded-[9px] border border-line bg-white px-3 py-2.5 transition-colors peer-checked:border-ink peer-checked:bg-rail peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
              <span className="block text-ui font-medium text-ink">{choice.title}</span>
              {choice.description && <span className="mt-0.5 block text-micro text-faint">{choice.description}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Waveform({ label = "Audio waveform preview" }: { label?: string }) {
  const bars = [18, 30, 22, 48, 62, 38, 72, 54, 28, 66, 82, 46, 34, 58, 74, 40, 24, 52, 68, 36, 78, 56, 30, 44, 64, 26, 48, 70, 42, 20, 54, 76, 38, 60, 32, 50, 24, 66, 46, 28, 58, 36, 18, 44, 62, 34, 52, 26, 40, 20, 48, 32, 16, 38, 26, 14, 30, 20, 12, 24, 16, 10];
  return (
    <div aria-label={label} role="img" className="flex h-[112px] items-center gap-[3px] overflow-hidden rounded-[12px] border border-line bg-[#fafaf9] px-4">
      {bars.map((height, index) => (
        <span
          key={index}
          className={`w-full max-w-1 flex-1 rounded-full ${index < 24 ? "bg-[#b6b6b1]" : "bg-[#dededa]"}`}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

export function WorkspaceHistory({ tool }: { tool: Tool }) {
  return (
    <section className="mt-5 overflow-hidden rounded-[14px] border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 py-3.5">
        <div className="flex items-center gap-2">
          <History size={15} className="text-muted" aria-hidden />
          <h2 className="text-ui font-semibold">History</h2>
        </div>
        <span className="text-micro text-faint">Recent outputs from this workspace</span>
      </div>
      <div className="hidden grid-cols-[minmax(0,1fr)_130px_100px_32px] gap-4 border-b border-line-soft px-4 py-2.5 text-micro font-medium text-faint sm:grid">
        <span>Name</span><span>Output</span><span>Created</span><span />
      </div>
      <div className="flex flex-col items-center px-5 py-9 text-center">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-rail text-muted">
          <Clock3 size={16} strokeWidth={1.5} aria-hidden />
        </span>
        <p className="mt-3 text-ui font-medium text-ink">No runs yet</p>
        <p className="mt-1 text-micro text-muted">Completed files and outputs will appear here.</p>
      </div>
    </section>
  );
}
