// OscillatorRack.tsx — the oscillator-stack section of the synth mixer.
// Every played note instantiates this whole enabled stack (multi-osc
// per voice — the APEX feature deferred in #457). Each oscillator has
// its own waveform, octave/cents detune, level, and pan.

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { WaveformPicker } from "../WaveformPicker";
import { LabeledSlider } from "./SynthControls";
import { makeOscillator, type OscillatorSpec } from "@/lib/audio/synth-patch";

interface Props {
  oscillators: OscillatorSpec[];
  onChange: (next: OscillatorSpec[]) => void;
}

export function OscillatorRack({ oscillators, onChange }: Props) {
  const updateOne = (id: string, patch: Partial<OscillatorSpec>) =>
    onChange(oscillators.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const remove = (id: string) => onChange(oscillators.filter((o) => o.id !== id));
  const add = () => onChange([...oscillators, makeOscillator()]);

  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Oscillators
        </h3>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </header>

      <div className="space-y-2">
        {oscillators.map((o, i) => (
          <div key={o.id} className="rounded-md border p-2 space-y-2 bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={o.enabled}
                  onCheckedChange={(enabled) => updateOne(o.id, { enabled })}
                  aria-label={`Oscillator ${i + 1} enabled`}
                />
                <Label className="text-[11px] font-medium">Osc {i + 1}</Label>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => remove(o.id)}
                disabled={oscillators.length <= 1}
                title={oscillators.length <= 1 ? "At least one oscillator is required" : "Remove oscillator"}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            <WaveformPicker
              label="Waveform"
              value={o.waveform}
              onChange={(waveform) => updateOne(o.id, { waveform })}
            />

            <div className="grid grid-cols-2 gap-2">
              <LabeledSlider
                label="Octave" unit="" value={o.detuneSemis} min={-24} max={24} step={12}
                format={(v) => (v >= 0 ? `+${v / 12}` : `${v / 12}`)}
                onChange={(v) => updateOne(o.id, { detuneSemis: v })}
              />
              <LabeledSlider
                label="Detune" unit="¢" value={o.detuneCents} min={-100} max={100} step={1}
                onChange={(v) => updateOne(o.id, { detuneCents: v })}
              />
              <LabeledSlider
                label="Level" unit="" value={o.gain} min={0} max={1} step={0.01}
                format={(v) => v.toFixed(2)}
                onChange={(v) => updateOne(o.id, { gain: v })}
              />
              <LabeledSlider
                label="Pan" unit="" value={o.pan} min={-1} max={1} step={0.01}
                format={(v) => (v === 0 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)}
                onChange={(v) => updateOne(o.id, { pan: v })}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
