"use client";

import Slider from "@/components/arc/slider/slider";

/** Arc slider without its built-in header, for cards that already show the label and value. */
export function RailSlider({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onValueChange,
  className = "mt-2",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  className?: string;
}) {
  return (
    <Slider
      label={label}
      hideHeader
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={onValueChange}
      className={className}
    />
  );
}
