/**
 * KeyframeParamControl (#282) — the editor for a numeric effect param that
 * animates across its clip. Shows the start value, the end value and the
 * curve between them; "Stop animating" collapses the track back to its
 * start value. Tracks with extra middle keyframes (written by a future
 * timeline keyframe lane) keep them — only the ends and curve are edited.
 *
 * Rendering is not done here: the param is resolved at the dispatch seams
 * (registry `applyEffects`, widget `resolveFrame`).
 */
"use client";

import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trackStartValue, type KeyframeTrack } from "@/lib/timeline/effects/keyframes";
import {
  MOTION_EASINGS,
  MOTION_EASING_LABEL_KEYS,
  type MotionEasing,
} from "@/lib/studio/editor-v2/widget-motion";

interface Props {
  label: string;
  track: KeyframeTrack;
  min: number;
  max: number;
  step: number;
  onChange: (next: KeyframeTrack | number) => void;
}

export default function KeyframeParamControl({ label, track, min, max, step, onChange }: Props) {
  const { t } = useTranslation();
  const frames = track.keyframes.slice().sort((a, b) => a.t - b.t);
  const first = frames[0];
  const last = frames[frames.length - 1];
  const easing: MotionEasing = first.easing && first.easing !== "hold" ? first.easing : "linear";

  const setEnd = (which: "from" | "to", value: number) => {
    const next = frames.map((k, i) => {
      if (which === "from" && i === 0) return { ...k, value };
      if (which === "to" && i === frames.length - 1) return { ...k, value };
      return k;
    });
    onChange({ keyframes: next });
  };
  const setEasing = (value: MotionEasing) => {
    onChange({
      keyframes: frames.map((k, i) => (i < frames.length - 1 ? { ...k, easing: value } : k)),
    });
  };
  const stopLabel = t("studio.effects.keyframes.stop");

  return (
    <div className="space-y-1.5 rounded border border-dashed border-primary/40 p-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px]">
          {label} <span className="text-primary">· {t("studio.effects.keyframes.animated")}</span>
        </Label>
        <Button
          size="icon"
          variant="ghost"
          className="h-11 w-11 min-h-11 min-w-11"
          onClick={() => onChange(trackStartValue(track))}
          title={stopLabel}
          aria-label={stopLabel}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <EndSlider label={t("studio.effects.keyframes.from")} value={first.value} min={min} max={max} step={step} onChange={(v) => setEnd("from", v)} />
      <EndSlider label={t("studio.effects.keyframes.to")} value={last.value} min={min} max={max} step={step} onChange={(v) => setEnd("to", v)} />
      <div className="space-y-1">
        <Label className="text-[11px]">{t("studio.effects.keyframes.curve")}</Label>
        <Select value={easing} onValueChange={(v) => setEasing(v as MotionEasing)}>
          <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MOTION_EASINGS.map((e) => (
              <SelectItem key={e} value={e} className="text-[11px]">{t(MOTION_EASING_LABEL_KEYS[e])}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function EndSlider({
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
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{value.toFixed(2)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0] ?? value)} />
    </div>
  );
}
