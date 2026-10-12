// EffectRack.tsx — serial effect section of the synth mixer. Reverb,
// delay, and chorus map to Tone.js Reverb / FeedbackDelay / Chorus in
// synth-graph. `mix` is the wet amount; disabled effects are dropped
// from the chain.

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LabeledSlider, TypeSelect } from "./SynthControls";
import {
  makeEffect,
  EFFECT_TYPES,
  EFFECT_TYPE_LABEL,
  type EffectSpec,
} from "@/lib/audio/synth-patch";

interface Props {
  effects: EffectSpec[];
  onChange: (next: EffectSpec[]) => void;
}

export function EffectRack({ effects, onChange }: Props) {
  const updateOne = (id: string, patch: Partial<EffectSpec>) =>
    onChange(effects.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => onChange(effects.filter((e) => e.id !== id));
  const add = () => onChange([...effects, makeEffect()]);

  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Effects
        </h3>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </header>

      {effects.length === 0 && (
        <p className="text-[10px] text-muted-foreground">No effects — dry signal.</p>
      )}

      <div className="space-y-2">
        {effects.map((e, i) => (
          <div key={e.id} className="rounded-md border p-2 space-y-2 bg-card">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Switch
                  checked={e.enabled}
                  onCheckedChange={(enabled) => updateOne(e.id, { enabled })}
                  aria-label={`Effect ${i + 1} enabled`}
                />
                <div className="flex-1 min-w-0">
                  <TypeSelect
                    value={e.type}
                    options={EFFECT_TYPES}
                    labels={EFFECT_TYPE_LABEL}
                    ariaLabel={`Effect ${i + 1} type`}
                    onChange={(type) => updateOne(e.id, { type })}
                  />
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => remove(e.id)}
                title="Remove effect"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            <LabeledSlider
              label="Mix (wet)" unit="%" value={e.mix} min={0} max={1} step={0.01}
              format={(v) => String(Math.round(v * 100))}
              onChange={(v) => updateOne(e.id, { mix: v })}
            />
            {i < effects.length - 1 && (
              <Label className="text-[9px] text-muted-foreground block">↓ feeds next effect</Label>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
