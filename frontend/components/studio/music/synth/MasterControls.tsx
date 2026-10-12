// MasterControls.tsx — master output (gain + global tuning) plus the
// shared voice envelope for the synth. The ADSR reuses the same
// AdsrControls strip every other Studio music surface uses.

import { LabeledSlider } from "./SynthControls";
import { AdsrControls } from "../AdsrControls";
import type { ADSR } from "@/lib/audio/synth-engine";
import type { MasterSpec } from "@/lib/audio/synth-patch";

interface Props {
  master: MasterSpec;
  adsr: ADSR;
  onMasterChange: (next: MasterSpec) => void;
  onAdsrChange: (next: ADSR) => void;
}

export function MasterControls({ master, adsr, onMasterChange, onAdsrChange }: Props) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Master
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <LabeledSlider
          label="Volume" unit="%" value={master.gain} min={0} max={1} step={0.01}
          format={(v) => String(Math.round(v * 100))}
          onChange={(gain) => onMasterChange({ ...master, gain })}
        />
        <LabeledSlider
          label="Tuning" unit="¢" value={master.detuneCents} min={-100} max={100} step={1}
          format={(v) => (v > 0 ? `+${v}` : String(v))}
          onChange={(detuneCents) => onMasterChange({ ...master, detuneCents })}
        />
      </div>
      <div className="pt-1 border-t">
        <AdsrControls value={adsr} onChange={onAdsrChange} heading="Envelope (all voices)" />
      </div>
    </section>
  );
}
