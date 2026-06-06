// FilterRack.tsx — serial filter section of the synth mixer. Each stage
// is a Tone.Filter (low/high/band-pass) with cutoff, resonance (Q), and
// a pre-filter drive. Disabled stages are skipped entirely in the audio
// graph (see synth-graph buildChain).

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LabeledSlider, TypeSelect } from "./SynthControls";
import {
  makeFilter,
  FILTER_TYPES,
  FILTER_TYPE_LABEL,
  type FilterSpec,
} from "@/lib/audio/synth-patch";

interface Props {
  filters: FilterSpec[];
  onChange: (next: FilterSpec[]) => void;
}

export function FilterRack({ filters, onChange }: Props) {
  const updateOne = (id: string, patch: Partial<FilterSpec>) =>
    onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id: string) => onChange(filters.filter((f) => f.id !== id));
  const add = () => onChange([...filters, makeFilter()]);

  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Filters
        </h3>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </header>

      {filters.length === 0 && (
        <p className="text-[10px] text-muted-foreground">No filters — signal passes through clean.</p>
      )}

      <div className="space-y-2">
        {filters.map((f, i) => (
          <div key={f.id} className="rounded-md border p-2 space-y-2 bg-card">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Switch
                  checked={f.enabled}
                  onCheckedChange={(enabled) => updateOne(f.id, { enabled })}
                  aria-label={`Filter ${i + 1} enabled`}
                />
                <div className="flex-1 min-w-0">
                  <TypeSelect
                    value={f.type}
                    options={FILTER_TYPES}
                    labels={FILTER_TYPE_LABEL}
                    ariaLabel={`Filter ${i + 1} type`}
                    onChange={(type) => updateOne(f.id, { type })}
                  />
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => remove(f.id)}
                title="Remove filter"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <LabeledSlider
                label="Cutoff" unit="Hz" value={f.cutoff} min={20} max={20000} step={10}
                format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
                onChange={(v) => updateOne(f.id, { cutoff: v })}
              />
              <LabeledSlider
                label="Reso (Q)" unit="" value={f.resonance} min={0} max={20} step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(v) => updateOne(f.id, { resonance: v })}
              />
              <LabeledSlider
                label="Drive" unit="dB" value={f.drive} min={-12} max={12} step={0.5}
                format={(v) => (v > 0 ? `+${v}` : String(v))}
                onChange={(v) => updateOne(f.id, { drive: v })}
              />
            </div>
            {i < filters.length - 1 && (
              <Label className="text-[9px] text-muted-foreground block">↓ feeds next filter</Label>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
