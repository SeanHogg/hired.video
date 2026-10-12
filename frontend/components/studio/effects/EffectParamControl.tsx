/**
 * EffectParamControl — one per-param control inside an effect card.
 * Driven by the registry definition: a param hint wins, otherwise the
 * control type is inferred from the default value's shape (number →
 * slider, hex string → colour, boolean → switch, [r,g,b] → triple).
 * Every label resolves through i18n (`studio.effects.param.<key>`).
 */

"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spline } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EffectParamHint } from "@/lib/timeline/effects";
import { parseCubeLut } from "@/lib/timeline/effects/lut";
import { isKeyframeTrack, rampTrack } from "@/lib/timeline/effects/keyframes";
import KeyframeParamControl from "./KeyframeParamControl";
import { useProEffectGate } from "./use-pro-effect-gate";

export interface LutBlob {
  size: number;
  data: number[];
}

interface Props {
  paramKey: string;
  currentValue: unknown;
  defaultValue: unknown;
  hint: EffectParamHint | undefined;
  effectKind: string;
  onChange: (v: unknown) => void;
  onApplyLutBlob: (parsed: LutBlob) => void;
}

export default function EffectParamControl({
  paramKey,
  currentValue,
  defaultValue,
  hint,
  effectKind,
  onChange,
  onApplyLutBlob,
}: Props) {
  const { t } = useTranslation();
  // LUT data is opaque — surface a file picker. The LUT case is the only
  // one a generic control can't infer from the default-value shape.
  if (effectKind === "lut" && paramKey === "data") {
    return <CubeLutFileControl onApply={onApplyLutBlob} />;
  }
  if (effectKind === "lut" && paramKey === "size") return null;

  const label = paramLabel(t, paramKey);

  if (hint?.type === "select") {
    return (
      <div className="space-y-1">
        <Label className="text-[11px]">{label}</Label>
        <Select value={typeof currentValue === "string" ? currentValue : String(defaultValue)} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {hint.options.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-[11px]">{t(o.labelKey)}</SelectItem>
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
        <Label className="text-[11px]">{label}</Label>
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-7 text-[11px]" />
      </div>
    );
  }
  if (typeof defaultValue === "boolean") {
    return (
      <div className="flex items-center justify-between">
        <Label className="text-[11px]">{label}</Label>
        <Switch checked={currentValue === true} onCheckedChange={(v) => onChange(v)} />
      </div>
    );
  }
  if (typeof defaultValue === "string" && /^#[0-9a-f]{6}$/i.test(defaultValue)) {
    return (
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px]">{label}</Label>
        <input
          type="color"
          value={typeof currentValue === "string" ? currentValue : defaultValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border"
          aria-label={label}
        />
      </div>
    );
  }
  if (typeof defaultValue === "number") {
    // Hint-supplied ranges win; numberRangeFor() is the legacy fallback.
    const fallback = numberRangeFor(paramKey);
    const min = hint?.type === "number" && hint.min !== undefined ? hint.min : fallback.min;
    const max = hint?.type === "number" && hint.max !== undefined ? hint.max : fallback.max;
    const step = hint?.type === "number" && hint.step !== undefined ? hint.step : fallback.step;
    if (isKeyframeTrack(currentValue)) {
      return <KeyframeParamControl label={label} track={currentValue} min={min} max={max} step={step} onChange={onChange} />;
    }
    const value = typeof currentValue === "number" ? currentValue : defaultValue;
    return <NumberParamControl label={label} value={value} min={min} max={max} step={step} onChange={onChange} />;
  }
  if (Array.isArray(defaultValue) && defaultValue.length === 3 && typeof defaultValue[0] === "number") {
    const arr = Array.isArray(currentValue) && currentValue.length === 3
      ? (currentValue as [number, number, number])
      : (defaultValue as [number, number, number]);
    return (
      <div className="space-y-1">
        <Label className="text-[11px]">{label}</Label>
        <div className="grid grid-cols-3 gap-1">
          {(["red", "green", "blue"] as const).map((channel, i) => (
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
              aria-label={t("studio.effects.channelAria", {
                param: label,
                channel: t(`studio.effects.option.channel.${channel}`),
              })}
            />
          ))}
        </div>
      </div>
    );
  }
  return null;
}

/** Static numeric slider + the Pro "Animate" toggle that turns the value
 *  into a start→end keyframe ramp across the clip (#282). */
function NumberParamControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: unknown) => void;
}) {
  const { t } = useTranslation();
  const { allow } = useProEffectGate();
  const animateLabel = t("studio.effects.keyframes.animate");
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1">
        <Label className="text-[11px]">{label}</Label>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground tabular-nums">{value.toFixed(2)}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 min-h-11 min-w-11"
            onClick={() => {
              if (allow(t("studio.effects.keyframes.feature"))) onChange(rampTrack(value, value));
            }}
            title={animateLabel}
            aria-label={animateLabel}
          >
            <Spline className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0] ?? value)} />
    </div>
  );
}

function CubeLutFileControl({ onApply }: { onApply: (parsed: LutBlob) => void }) {
  const { t } = useTranslation();
  const [error, setError] = React.useState<string | null>(null);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      onApply(parseCubeLut(text));
    } catch {
      setError(t("studio.effects.cubeLoadFailed"));
    }
  }
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{t("studio.effects.cubeFile")}</Label>
      <Input type="file" accept=".cube" onChange={onFile} className="h-7 text-[11px]" />
      {error && <div className="text-[10px] text-destructive">{error}</div>}
    </div>
  );
}

/** Localized param label. Known params carry a key; an unknown future
 *  param falls back to its humanized key so the control is never blank. */
function paramLabel(t: TFunction, key: string): string {
  return t(`studio.effects.param.${key}`, {
    defaultValue: key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
  });
}

function numberRangeFor(key: string): { min: number; max: number; step: number } {
  switch (key) {
    case "tx":
    case "ty":
      return { min: -1000, max: 1000, step: 1 };
    case "scale":
      return { min: 0.1, max: 5, step: 0.01 };
    case "rotateDeg":
      return { min: -180, max: 180, step: 1 };
    default:
      // opacity / intensity / threshold / softness / spill / feather /
      // x / y / width / height and anything else normalised.
      return { min: 0, max: 1, step: 0.01 };
  }
}
