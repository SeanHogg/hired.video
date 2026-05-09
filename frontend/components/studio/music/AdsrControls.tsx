// Shared ADSR control strip — four sliders side by side, fixed
// formatting + range across every Studio music surface. Drives the
// shared `ADSR` type from `@/lib/audio/synth-engine`.

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { ADSR } from "@/lib/audio/synth-engine";

interface Props {
  value: ADSR;
  onChange: (next: ADSR) => void;
  /** Section heading. Defaults to a neutral label so callers can
   *  customise (e.g. "Envelope (bass + melody)"). */
  heading?: string;
}

export function AdsrControls({ value, onChange, heading = "Envelope" }: Props) {
  const patch = (p: Partial<ADSR>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{heading}</div>
      <div className="grid grid-cols-4 gap-2">
        <AdsrSlider label="Attack"  unit="s" value={value.attack}  min={0.001} max={0.5} step={0.001} format={(v) => v.toFixed(3)} onChange={(v) => patch({ attack: v })} />
        <AdsrSlider label="Decay"   unit="s" value={value.decay}   min={0.001} max={0.8} step={0.001} format={(v) => v.toFixed(3)} onChange={(v) => patch({ decay: v })} />
        <AdsrSlider label="Sustain" unit=""  value={value.sustain} min={0}     max={1}   step={0.01}  format={(v) => v.toFixed(2)} onChange={(v) => patch({ sustain: v })} />
        <AdsrSlider label="Release" unit="s" value={value.release} min={0.001} max={1}   step={0.001} format={(v) => v.toFixed(3)} onChange={(v) => patch({ release: v })} />
      </div>
    </div>
  );
}

function AdsrSlider({
  label, unit, value, min, max, step, format, onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-[10px] mb-1 block">
        {label}: {format(value)}{unit}
      </Label>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
