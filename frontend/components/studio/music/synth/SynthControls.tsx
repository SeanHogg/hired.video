// SynthControls.tsx — tiny shared control primitives for the synth
// mixer racks. Keeps the labelled-slider + enum-select markup in one
// place so the oscillator / filter / effect / master racks can't drift
// on spacing, value formatting, or select styling.

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  format = (v) => String(v),
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-[10px] mb-1 block">
        {label}: {format(value)}
        {unit}
      </Label>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

/** Enum picker bound to a string-literal union. `labels` maps each value
 *  to its display text. */
export function TypeSelect<T extends string>({
  value,
  options,
  labels,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className="h-7 text-[11px]" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="text-[11px]">
            {labels[o]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
