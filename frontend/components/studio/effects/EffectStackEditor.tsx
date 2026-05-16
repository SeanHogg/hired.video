/**
 * EffectStackEditor — generic UI for an ordered list of registry
 * effects on any host (scene, timeline clip, etc.). Per the standing
 * DRY rule, this is the ONE place per-effect param controls live;
 * consumers pass `effects` + `onChange` and get add/remove/reorder
 * + per-param sliders/colour-pickers/text-inputs/selects driven by
 * each effect's registry definition.
 *
 * Self-gates: when there are no effects AND `compact` is true, the
 * footer-only mode renders a single "Add effect" trigger with no
 * empty-state copy.
 */

"use client";

import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Aperture,
  Asterisk,
  ChevronDown,
  ChevronUp,
  Coffee,
  Contrast,
  Droplet,
  Eye,
  EyeOff,
  Film,
  FlipHorizontal2,
  Grid3x3,
  Lock,
  Move,
  MoveLeft,
  MoveRight,
  PaintBucket,
  Palette,
  Pipette,
  Plus,
  Rows3,
  Scissors,
  Snowflake,
  Sparkle,
  Sparkles,
  Spline,
  SquareDashed,
  Sun,
  SunDim,
  Trash2,
  Triangle,
  Type,
  Vibrate,
  Wand2,
  Zap,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAudioEffectDefinition,
  getEffectDefinition,
  listEffects,
  type EffectParamHint,
} from "@/lib/timeline/effects";
import { parseCubeLut } from "@/lib/timeline/effects/lut";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { toast } from "@/hooks/use-toast";

/** One entry in an effect stack — `{kind, params}` matches the
 *  registry's `ClipEffect` AND `SceneEffect` shape so the same editor
 *  drives both consumers. */
export interface StackEntry {
  kind: string;
  params: Record<string, unknown>;
}

/** Panel-facing slice of an effect definition. Both `EffectDefinition`
 *  (visual) and `AudioEffectDefinition` (audio) duck-type to this — the
 *  panel only cares about the bits it renders, not how the effect runs. */
export interface PanelEffectDefinition {
  kind: string;
  label: string;
  category: string;
  defaults: Record<string, unknown>;
  paramHints?: Record<string, EffectParamHint>;
  proOnly?: boolean;
}

interface Props {
  effects: StackEntry[];
  onChange: (next: StackEntry[]) => void;
  /** When true, renders a compact in-card layout (no panel chrome). */
  compact?: boolean;
  /** Optional category filter — when set, only effects of these
   *  categories show in the Add menu. Useful for hiding `title`
   *  effects from contexts where they don't make sense. */
  allowedCategories?: string[];
  /** Optional override for the catalog. Defaults to the visual effect
   *  registry. Pass `listAudioEffects()` to drive the audio FX rack
   *  off the same panel — single component for every stack surface. */
  catalog?: PanelEffectDefinition[];
}

// Picker grid icons — one per registered effect kind. Kept here (UI
// layer) rather than on the registry definition so library code in
// `lib/timeline/effects/*` stays free of React/lucide imports. The
// picker falls back to `Sparkle` for any unknown kind.
const EFFECT_ICONS: Record<string, LucideIcon> = {
  // animate
  "animate-fade-in": Eye,
  "animate-fade-out": EyeOff,
  "animate-zoom-in": ZoomIn,
  "animate-zoom-out": ZoomOut,
  "animate-pan-left": MoveLeft,
  "animate-pan-right": MoveRight,
  "animate-pulse": Activity,
  "animate-shake": Vibrate,
  // color
  sepia: Coffee,
  mono: Contrast,
  invert: FlipHorizontal2,
  "color-wheels": PaintBucket,
  curves: Spline,
  hsl: Palette,
  lut: Film,
  "power-window": SquareDashed,
  secondary: Pipette,
  // stylize
  snow: Snowflake,
  "light-leak": Sun,
  "scan-lines": Rows3,
  sparkles: Sparkles,
  particles: Wand2,
  blur: Droplet,
  glow: SunDim,
  "film-grain": Grid3x3,
  "chromatic-aberration": Asterisk,
  vignette: Aperture,
  glitch: Zap,
  sharpen: Triangle,
  // key
  "chroma-key": Scissors,
  // title
  "title-card": Type,
  // transform
  transform: Move,
  opacity: Eye,
  "mask-rect": SquareDashed,
};

export default function EffectStackEditor({
  effects,
  onChange,
  compact,
  allowedCategories,
  catalog: catalogOverride,
}: Props) {
  const navigate = useNavigate();
  const { isPro } = useSubscription();
  const baseCatalog: PanelEffectDefinition[] = catalogOverride ?? listEffects();
  const catalog = baseCatalog.filter(
    (def) => !allowedCategories || allowedCategories.includes(def.category),
  );
  const grouped = groupByCategory(catalog);

  const add = (def: PanelEffectDefinition) => {
    if (def.proOnly && !isPro) {
      toast({
        title: `${def.label} is a Pro effect`,
        description: "Upgrade to Pro to apply advanced effects to your timeline.",
        action: (
          <Button
            size="sm"
            variant="default"
            onClick={() => navigate("/pricing")}
          >
            Upgrade
          </Button>
        ) as React.ReactElement,
      });
      return;
    }
    onChange([...effects, { kind: def.kind, params: { ...def.defaults } }]);
  };
  const remove = (idx: number) => {
    onChange(effects.filter((_, i) => i !== idx));
  };
  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= effects.length) return;
    const next = effects.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  const patchParam = (idx: number, key: string, value: unknown) => {
    onChange(
      effects.map((eff, i) =>
        i === idx ? { ...eff, params: { ...eff.params, [key]: value } } : eff,
      ),
    );
  };

  return (
    <div className={compact ? "space-y-1.5" : "flex flex-col h-full"}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Effects · {effects.length}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="left"
            sideOffset={8}
            collisionPadding={12}
            className="w-[320px] max-h-[70vh] overflow-y-auto"
          >
            {Array.from(grouped.entries()).map(([category, defs], i) => (
              <React.Fragment key={category}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[10px] uppercase">{category}</DropdownMenuLabel>
                <div className="grid grid-cols-3 gap-1 px-1 pb-1">
                  {defs.map((def) => {
                    const locked = def.proOnly && !isPro;
                    const Icon = EFFECT_ICONS[def.kind] ?? Sparkle;
                    return (
                      <DropdownMenuItem
                        key={def.kind}
                        onSelect={() => add(def)}
                        className={`relative flex h-[68px] flex-col items-center justify-center gap-1 rounded-md border border-transparent px-1.5 py-2 text-center hover:border-border hover:bg-accent ${
                          locked ? "text-muted-foreground" : ""
                        }`}
                        title={def.label}
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
                        <span className="line-clamp-2 text-[10px] leading-tight">
                          {def.label}
                        </span>
                        {def.proOnly && (
                          <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            {locked && <Lock className="h-2 w-2" />}
                            Pro
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {effects.length === 0 && !compact && (
        <div className="text-xs text-muted-foreground px-2 py-4 text-center">
          No effects yet. Click <em>Add</em> to apply colour grading,
          masks, keying, stylise filters, and more.
        </div>
      )}
      <div className={compact ? "space-y-1.5" : "space-y-2 p-2 overflow-y-auto"}>
        {effects.map((eff, idx) => (
          <EffectCard
            key={`${eff.kind}-${idx}`}
            effect={eff}
            index={idx}
            total={effects.length}
            onMove={move}
            onRemove={remove}
            onPatchParam={patchParam}
            onApplyLutBlob={(parsed) => {
              // LUT helper writes both `size` and `data` together;
              // single source of truth for that pair.
              onChange(
                effects.map((e, i) =>
                  i === idx
                    ? { ...e, params: { ...e.params, size: parsed.size, data: parsed.data } }
                    : e,
                ),
              );
            }}
          />
        ))}
      </div>
    </div>
  );
}

function EffectCard({
  effect,
  index,
  total,
  onMove,
  onRemove,
  onPatchParam,
  onApplyLutBlob,
}: {
  effect: StackEntry;
  index: number;
  total: number;
  onMove: (idx: number, dir: -1 | 1) => void;
  onRemove: (idx: number) => void;
  onPatchParam: (idx: number, key: string, value: unknown) => void;
  onApplyLutBlob: (parsed: { size: number; data: number[] }) => void;
}) {
  // Look up across both registries — same panel renders visual and
  // audio effects, so we don't know which one this kind lives in.
  const def: PanelEffectDefinition | null =
    getEffectDefinition(effect.kind) ?? getAudioEffectDefinition(effect.kind);
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
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={index === 0} onClick={() => onMove(index, -1)} title="Move earlier">
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={index === total - 1} onClick={() => onMove(index, 1)} title="Move later">
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onRemove(index)} title="Remove">
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
            onApplyLutBlob={onApplyLutBlob}
          />
        ))}
      </div>
    </div>
  );
}

function ParamControl({
  paramKey,
  currentValue,
  defaultValue,
  hint,
  effectKind,
  onChange,
  onApplyLutBlob,
}: {
  paramKey: string;
  currentValue: unknown;
  defaultValue: unknown;
  hint: EffectParamHint | undefined;
  effectKind: string;
  onChange: (v: unknown) => void;
  onApplyLutBlob: (parsed: { size: number; data: number[] }) => void;
}) {
  // LUT data is opaque — surface a file picker. Hidden by default for
  // non-LUT effects; the LUT case is the only one a generic ParamControl
  // can't infer from the default-value shape.
  if (effectKind === "lut" && paramKey === "data") {
    return <CubeLutFileControl onApply={onApplyLutBlob} />;
  }
  if (effectKind === "lut" && paramKey === "size") return null;

  if (hint?.type === "select") {
    return (
      <div className="space-y-1">
        <Label className="text-[11px]">{labelFor(paramKey)}</Label>
        <Select value={typeof currentValue === "string" ? currentValue : String(defaultValue)} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {hint.options.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-[11px]">{o.label}</SelectItem>
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
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-7 text-[11px]" />
      </div>
    );
  }
  if (typeof defaultValue === "boolean") {
    return (
      <div className="flex items-center justify-between">
        <Label className="text-[11px]">{labelFor(paramKey)}</Label>
        <Switch checked={currentValue === true} onCheckedChange={(v) => onChange(v)} />
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
    // Hint-supplied ranges win; numberRangeFor() is the legacy fallback.
    const fallback = numberRangeFor(paramKey);
    const min = hint?.type === "number" && hint.min !== undefined ? hint.min : fallback.min;
    const max = hint?.type === "number" && hint.max !== undefined ? hint.max : fallback.max;
    const step = hint?.type === "number" && hint.step !== undefined ? hint.step : fallback.step;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">{labelFor(paramKey)}</Label>
          <span className="text-[10px] text-muted-foreground tabular-nums">{value.toFixed(2)}</span>
        </div>
        <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0] ?? value)} />
      </div>
    );
  }
  if (Array.isArray(defaultValue) && defaultValue.length === 3 && typeof defaultValue[0] === "number") {
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

function CubeLutFileControl({ onApply }: { onApply: (parsed: { size: number; data: number[] }) => void }) {
  const [error, setError] = React.useState<string | null>(null);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      onApply(parseCubeLut(text));
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

function labelFor(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

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

function groupByCategory(defs: PanelEffectDefinition[]): Map<string, PanelEffectDefinition[]> {
  const out = new Map<string, PanelEffectDefinition[]>();
  for (const d of defs) {
    const arr = out.get(d.category);
    if (arr) arr.push(d);
    else out.set(d.category, [d]);
  }
  return out;
}
