/**
 * EffectStackEditor — generic UI for an ordered list of registry
 * effects on any host (scene, timeline clip, etc.). Per the standing
 * DRY rule, this is the ONE place an effect stack is edited; consumers
 * pass `effects` + `onChange` and get add/remove/reorder + per-param
 * controls (EffectParamControl) driven by each effect's registry
 * definition. Every string — effect labels, categories, params,
 * options — resolves through i18n (registry defs carry `labelKey`).
 *
 * Self-gates: when there are no effects AND `compact` is true, the
 * footer-only mode renders a single "Add effect" trigger with no
 * empty-state copy.
 */

"use client";

import React from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ChevronDown, ChevronUp, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProTag from "@/components/build/ProTag";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getAudioEffectDefinition,
  getEffectDefinition,
  listEffects,
  type EffectParamHint,
} from "@/lib/timeline/effects";
import { useProEffectGate } from "./use-pro-effect-gate";
import EffectParamControl, { type LutBlob } from "./EffectParamControl";
import { effectIcon } from "./effect-icons";

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
  labelKey: string;
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

export default function EffectStackEditor({
  effects,
  onChange,
  compact,
  allowedCategories,
  catalog: catalogOverride,
}: Props) {
  const { t } = useTranslation();
  const { isPro, allow } = useProEffectGate();
  const baseCatalog: PanelEffectDefinition[] = catalogOverride ?? listEffects();
  const catalog = baseCatalog.filter(
    (def) => !allowedCategories || allowedCategories.includes(def.category),
  );
  const grouped = groupByCategory(catalog, t);

  const add = (def: PanelEffectDefinition) => {
    if (def.proOnly && !allow(t(def.labelKey))) return;
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
          {t("studio.effects.count", { count: effects.length })}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="min-h-11 px-2 text-xs">
              <Plus className="h-3 w-3 mr-1" /> {t("studio.effects.add")}
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
                <DropdownMenuLabel className="text-[10px] uppercase">
                  {t(`studio.effects.category.${category}`, { defaultValue: category })}
                </DropdownMenuLabel>
                <div className="grid grid-cols-3 gap-1 px-1 pb-1">
                  {defs.map((def) => {
                    const locked = def.proOnly && !isPro;
                    const Icon = effectIcon(def.kind);
                    const label = t(def.labelKey);
                    return (
                      <DropdownMenuItem
                        key={def.kind}
                        onSelect={() => add(def)}
                        className={`relative flex h-[68px] flex-col items-center justify-center gap-1 rounded-md border border-transparent px-1.5 py-2 text-center hover:border-border hover:bg-accent ${
                          locked ? "text-muted-foreground" : ""
                        }`}
                        title={label}
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
                        <span className="line-clamp-2 text-[10px] leading-tight">
                          {label}
                        </span>
                        {def.proOnly && (
                          <span className="absolute right-1 top-1 inline-flex items-center gap-0.5">
                            {locked && <Lock className="h-2.5 w-2.5" aria-hidden />}
                            <ProTag />
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
          <Trans i18nKey="studio.effects.empty" components={{ em: <em /> }} />
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
  onApplyLutBlob: (parsed: LutBlob) => void;
}) {
  const { t } = useTranslation();
  // Look up across both registries — same panel renders visual and
  // audio effects, so we don't know which one this kind lives in.
  const def: PanelEffectDefinition | null =
    getEffectDefinition(effect.kind) ?? getAudioEffectDefinition(effect.kind);
  const removeLabel = t("studio.effects.remove");
  if (!def) {
    return (
      <div className="rounded border border-dashed bg-background/40 p-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            {t("studio.effects.unknown", { kind: effect.kind })}
          </span>
          <Button size="icon" variant="ghost" className="h-11 w-11 min-h-11 min-w-11" onClick={() => onRemove(index)} title={removeLabel} aria-label={removeLabel}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  const earlier = t("studio.effects.moveEarlier");
  const later = t("studio.effects.moveLater");
  return (
    <div className="rounded border bg-background p-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium">{t(def.labelKey)}</span>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-11 w-11 min-h-11 min-w-11" disabled={index === 0} onClick={() => onMove(index, -1)} title={earlier} aria-label={earlier}>
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-11 w-11 min-h-11 min-w-11" disabled={index === total - 1} onClick={() => onMove(index, 1)} title={later} aria-label={later}>
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-11 w-11 min-h-11 min-w-11 text-destructive" onClick={() => onRemove(index)} title={removeLabel} aria-label={removeLabel}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {Object.keys(def.defaults).map((key) => (
          <EffectParamControl
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

/** Group by category, each group ordered by its localized label. */
function groupByCategory(
  defs: PanelEffectDefinition[],
  t: TFunction,
): Map<string, PanelEffectDefinition[]> {
  const out = new Map<string, PanelEffectDefinition[]>();
  for (const d of defs) {
    const arr = out.get(d.category);
    if (arr) arr.push(d);
    else out.set(d.category, [d]);
  }
  for (const arr of out.values()) {
    arr.sort((a, b) => t(a.labelKey).localeCompare(t(b.labelKey)));
  }
  return out;
}
