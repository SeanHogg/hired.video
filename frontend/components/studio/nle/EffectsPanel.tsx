/**
 * EffectsPanel — the UI surface for adding, ordering, tweaking, and
 * removing per-clip effects. Mounted inside NleCanvas's right rail when
 * a clip is selected; self-gates (returns null) when no clip is
 * selected so the parent doesn't have to branch.
 *
 * Per the standing DRY rule, this panel does NOT branch on effect
 * `kind` to render the right input controls. It reads each param's
 * default value from the registry and dispatches via `ParamControl`
 * below, which picks the right widget by the value's shape. Adding a
 * new effect kind needs zero edits here.
 */

"use client";

import React from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  listEffects,
  getEffectDefinition,
  type EffectDefinition,
  type EffectParamHint,
} from "@/lib/timeline/effects";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseCubeLut } from "@/lib/timeline/effects/lut";
import {
  addClipEffect,
  findClip,
  patchClipEffectParam,
  removeClipEffect,
  reorderClipEffect,
} from "@/lib/timeline/operations";
import type { ClipEffect, Timeline } from "@shared/timeline";

interface Props {
  timeline: Timeline;
  selectedClipId: string | null;
  onTimelineChange: (next: Timeline) => void;
}

export default function EffectsPanel({ timeline, selectedClipId, onTimelineChange }: Props) {
  if (!selectedClipId) return null;
  const found = findClip(timeline, selectedClipId);
  if (!found) return null;
  const effects = found.clip.effects ?? [];

  const addEffect = (def: EffectDefinition) => {
    onTimelineChange(
      addClipEffect(timeline, selectedClipId, {
        kind: def.kind,
        params: { ...def.defaults },
      }),
    );
  };

  const remove = (idx: number) => {
    onTimelineChange(removeClipEffect(timeline, selectedClipId, idx));
  };

  const move = (idx: number, dir: -1 | 1) => {
    onTimelineChange(reorderClipEffect(timeline, selectedClipId, idx, idx + dir));
  };

  const patchParam = (idx: number, key: string, value: unknown) => {
    onTimelineChange(patchClipEffectParam(timeline, selectedClipId, idx, key, value));
  };

  const catalog = listEffects();
  const grouped = groupByCategory(catalog);

  return (
    <div className="flex flex-col h-full border-l bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Effects · {effects.length}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {Array.from(grouped.entries()).map(([category, defs], i) => (
              <React.Fragment key={category}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[10px] uppercase">{category}</DropdownMenuLabel>
                {defs.map((def) => (
                  <DropdownMenuItem key={def.kind} onSelect={() => addEffect(def)}>
                    {def.label}
                  </DropdownMenuItem>
                ))}
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {effects.length === 0 && (
          <div className="text-xs text-muted-foreground px-2 py-4 text-center">
            No effects on this clip. Click <em>Add</em> to apply colour
            grading, masks, keying, and more.
          </div>
        )}
        {effects.map((eff, idx) => (
          <EffectCard
            key={`${eff.kind}-${idx}`}
            effect={eff}
            index={idx}
            total={effects.length}
            onMove={move}
            onRemove={remove}
            onPatchParam={patchParam}
            timeline={timeline}
            clipId={selectedClipId}
            onTimelineChange={onTimelineChange}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EffectCard — one card per applied effect. Self-gates when the kind
// is unknown (foreign-version effect) by rendering a graceful fallback
// instead of crashing the panel.
// ---------------------------------------------------------------------------

function EffectCard({
  effect,
  index,
  total,
  onMove,
  onRemove,
  onPatchParam,
  timeline,
  clipId,
  onTimelineChange,
}: {
  effect: ClipEffect;
  index: number;
  total: number;
  onMove: (idx: number, dir: -1 | 1) => void;
  onRemove: (idx: number) => void;
  onPatchParam: (idx: number, key: string, value: unknown) => void;
  timeline: Timeline;
  clipId: string;
  onTimelineChange: (next: Timeline) => void;
}) {
  const def = getEffectDefinition(effect.kind);
  if (!def) {
    return (
      <div className="rounded border border-dashed bg-background/40 p-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Unknown effect: {effect.kind}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRemove(index)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border bg-background p-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium">{def.label}</span>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
            title="Move up (runs earlier)"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
            title="Move down (runs later)"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-destructive"
            onClick={() => onRemove(index)}
            title="Remove effect"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {Object.keys(def.defaults).map((key) => (
          <ParamControl
            key={key}
            paramKey={key}
            currentValue={effect.params[key] ?? def.defaults[key]}
            defaultValue={def.defaults[key]}
            hint={def.paramHints?.[key]}
            effectKind={def.kind}
            onChange={(v) => onPatchParam(index, key, v)}
            timeline={timeline}
            clipId={clipId}
            onTimelineChange={onTimelineChange}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ParamControl — picks the right widget based on the param's default
// shape so adding a new effect needs zero EffectsPanel edits.
//
// Rules (single source of truth — every effect's params route through here):
//   - boolean              → Switch
//   - "#" + 6 hex chars    → colour input
//   - number               → numeric input + slider when bounded
//   - [number, number, number]  → 3 numeric inputs, one row
//   - everything else      → file-picker fallback (LUT data, etc.)
// ---------------------------------------------------------------------------

function ParamControl({
  paramKey,
  currentValue,
  defaultValue,
  hint,
  effectKind,
  onChange,
  timeline,
  clipId,
  onTimelineChange,
}: {
  paramKey: string;
  currentValue: unknown;
  defaultValue: unknown;
  hint: EffectParamHint | undefined;
  effectKind: string;
  onChange: (v: unknown) => void;
  timeline: Timeline;
  clipId: string;
  onTimelineChange: (next: Timeline) => void;
}) {
  // LUT data is opaque — surface a file picker that parses .cube and
  // patches both `data` and `size` at once. The control hides itself
  // unless the effect is the LUT effect to keep the panel tidy.
  if (effectKind === "lut" && paramKey === "data") {
    return <CubeLutFileControl timeline={timeline} clipId={clipId} onTimelineChange={onTimelineChange} />;
  }
  if (effectKind === "lut" && paramKey === "size") {
    // Size is set by the .cube parser; hide the raw control.
    return null;
  }

  // Explicit hints from the registry win over inference. This is the
  // ONE place new control types plug in; effects don't ship per-effect
  // UI components.
  if (hint?.type === "select") {
    return (
      <div className="space-y-1">
        <Label className="text-[11px]">{labelFor(paramKey)}</Label>
        <Select
          value={typeof currentValue === "string" ? currentValue : String(defaultValue)}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hint.options.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-[11px]">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (hint?.type === "text") {
    const value = typeof currentValue === "string" ? currentValue : String(defaultValue ?? "");
    return (
      <div className="space-y-1">
        <Label className="text-[11px]">{labelFor(paramKey)}</Label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 text-[11px]"
        />
      </div>
    );
  }

  if (typeof defaultValue === "boolean") {
    return (
      <div className="flex items-center justify-between">
        <Label className="text-[11px]">{labelFor(paramKey)}</Label>
        <Switch
          checked={currentValue === true}
          onCheckedChange={(v) => onChange(v)}
        />
      </div>
    );
  }

  if (typeof defaultValue === "string" && /^#[0-9a-f]{6}$/i.test(defaultValue)) {
    return (
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px]">{labelFor(paramKey)}</Label>
        <input
          type="color"
          value={typeof currentValue === "string" ? currentValue : defaultValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border"
        />
      </div>
    );
  }

  if (typeof defaultValue === "number") {
    const value = typeof currentValue === "number" ? currentValue : defaultValue;
    const { min, max, step } = numberRangeFor(paramKey);
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">{labelFor(paramKey)}</Label>
          <span className="text-[10px] text-muted-foreground tabular-nums">{value.toFixed(2)}</span>
        </div>
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => onChange(v[0] ?? value)}
        />
      </div>
    );
  }

  if (
    Array.isArray(defaultValue) &&
    defaultValue.length === 3 &&
    typeof defaultValue[0] === "number"
  ) {
    const arr = Array.isArray(currentValue) && currentValue.length === 3
      ? (currentValue as [number, number, number])
      : (defaultValue as [number, number, number]);
    return (
      <div className="space-y-1">
        <Label className="text-[11px]">{labelFor(paramKey)}</Label>
        <div className="grid grid-cols-3 gap-1">
          {(["R", "G", "B"] as const).map((channel, i) => (
            <Input
              key={channel}
              type="number"
              step={0.01}
              value={arr[i] ?? 0}
              onChange={(e) => {
                const next = [...arr] as [number, number, number];
                const n = parseFloat(e.target.value);
                next[i] = Number.isFinite(n) ? n : arr[i];
                onChange(next);
              }}
              className="h-7 text-[11px] tabular-nums"
              aria-label={`${labelFor(paramKey)} ${channel}`}
            />
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function labelFor(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

/** Sensible slider range for a known numeric param key. New numeric
 *  params fall back to 0..1 — effects that need a different range
 *  should add a clause here once. Single source of truth so the slider
 *  range is consistent regardless of which effect uses the same key. */
function numberRangeFor(key: string): { min: number; max: number; step: number } {
  switch (key) {
    case "opacity":
    case "intensity":
    case "threshold":
    case "softness":
    case "spillSuppression":
    case "feather":
      return { min: 0, max: 1, step: 0.01 };
    case "tx":
    case "ty":
      return { min: -1000, max: 1000, step: 1 };
    case "scale":
      return { min: 0.1, max: 5, step: 0.01 };
    case "rotateDeg":
      return { min: -180, max: 180, step: 1 };
    case "x":
    case "y":
    case "width":
    case "height":
      return { min: 0, max: 1, step: 0.01 };
    default:
      return { min: 0, max: 1, step: 0.01 };
  }
}

function groupByCategory(defs: EffectDefinition[]): Map<EffectDefinition["category"], EffectDefinition[]> {
  const out = new Map<EffectDefinition["category"], EffectDefinition[]>();
  for (const d of defs) {
    const arr = out.get(d.category);
    if (arr) arr.push(d);
    else out.set(d.category, [d]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// CubeLutFileControl — file picker that parses .cube and patches both
// `data` and `size` on the underlying effect. Self-gates: lives only
// when the effect kind is "lut", per the dispatch in ParamControl.
// ---------------------------------------------------------------------------

function CubeLutFileControl({
  timeline,
  clipId,
  onTimelineChange,
}: {
  timeline: Timeline;
  clipId: string;
  onTimelineChange: (next: Timeline) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const { size, data } = parseCubeLut(text);
      const found = findClip(timeline, clipId);
      if (!found) return;
      const idx = (found.clip.effects ?? []).findIndex((eff) => eff.kind === "lut");
      if (idx < 0) return;
      let next = patchClipEffectParam(timeline, clipId, idx, "size", size);
      next = patchClipEffectParam(next, clipId, idx, "data", data);
      onTimelineChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load .cube");
    }
  }

  return (
    <div className="space-y-1">
      <Label className="text-[11px]">.cube file</Label>
      <Input type="file" accept=".cube" onChange={onFile} className="h-7 text-[11px]" />
      {error && <div className="text-[10px] text-destructive">{error}</div>}
    </div>
  );
}
