"use client";

import type { ReactNode } from "react";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import { RailSwitch } from "@/components/tool/studio/RailSwitch";
import { RailEnds, RailLabel } from "@/components/tool/studio/RailControls";

/** Flat settings group: a heading and its controls. Spacing separates groups. */
export function PaidSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold uppercase">{title}</h3>
        {hint ? <span className="fb-num text-[13px] text-faint">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function PaidToggle({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <RailSwitch label={title} description={description} checked={checked} onChange={onChange} disabled={disabled} />
  );
}

export function PaidSlider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
  left,
  right,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  left?: string;
  right?: string;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-45" : ""}>
      <RailLabel
        className="!mb-1"
        value={
          <>
            {value}
            {suffix}
          </>
        }
      >
        {label}
      </RailLabel>
      <RailSlider
        label={label}
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        disabled={disabled}
        onValueChange={onChange}
        className=""
      />
      {left || right ? <RailEnds left={left} right={right} /> : null}
    </div>
  );
}
