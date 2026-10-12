// Shared waveform picker — used by both the step-sequencer (one per
// pitched lane) and the piano (single shared timbre). Lives here so
// the chip styling + label table can never drift between surfaces.

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { WAVEFORMS, WAVEFORM_LABEL, type Waveform } from "@/lib/audio/synth-engine";

interface Props {
  label: string;
  value: Waveform;
  onChange: (w: Waveform) => void;
  className?: string;
}

export function WaveformPicker({ label, value, onChange, className }: Props) {
  return (
    <div className={className}>
      <Label className="text-[11px] mb-1 block">{label}</Label>
      <div className="flex gap-1">
        {WAVEFORMS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onChange(w)}
            className={cn(
              "flex-1 h-7 rounded border text-[10px] transition-colors",
              value === w
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-accent",
            )}
          >
            {WAVEFORM_LABEL[w]}
          </button>
        ))}
      </div>
    </div>
  );
}
