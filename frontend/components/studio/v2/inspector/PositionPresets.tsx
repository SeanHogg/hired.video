/**
 * 9-button quick layout selector — the same affordance v1 surfaced on
 * image and text elements (full / half-left / half-right / small-left /
 * small-right / corner-tl / corner-tr / corner-bl / corner-br). Shared
 * across every widget kind in the inspector Layout section so a user
 * gets the same one-click "land it where I want" UX everywhere (DRY).
 *
 * Per-preset boxes match v1's percentages exactly so a v1→v2 import
 * lands at the same coordinates the user authored in v1.
 */
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";

export interface PositionPreset {
  value: string;
  /** i18n key (studio.position.*) — translate at render. */
  labelKey: string;
  icon: string;
  /** Fractional (0..1) box — already in canvas-state units, no `/100`
   *  conversion needed at the call site. */
  box: { x: number; y: number; width: number; height: number };
}

export const POSITION_PRESETS: PositionPreset[] = [
  { value: "full",        labelKey: "studio.position.full", icon: "■", box: { x: 0,    y: 0,    width: 1,    height: 1    } },
  { value: "half-left",   labelKey: "studio.position.halfLeft", icon: "◧", box: { x: 0,    y: 0,    width: 0.5,  height: 1    } },
  { value: "half-right",  labelKey: "studio.position.halfRight", icon: "◨", box: { x: 0.5,  y: 0,    width: 0.5,  height: 1    } },
  { value: "small-left",  labelKey: "studio.position.smallLeft", icon: "◐", box: { x: 0.05, y: 0.20, width: 0.42, height: 0.6  } },
  { value: "small-right", labelKey: "studio.position.smallRight", icon: "◑", box: { x: 0.53, y: 0.20, width: 0.42, height: 0.6  } },
  { value: "corner-tl",   labelKey: "studio.position.topLeft", icon: "◸", box: { x: 0.03, y: 0.03, width: 0.36, height: 0.36 } },
  { value: "corner-tr",   labelKey: "studio.position.topRight", icon: "◹", box: { x: 0.61, y: 0.03, width: 0.36, height: 0.36 } },
  { value: "corner-bl",   labelKey: "studio.position.bottomLeft", icon: "◺", box: { x: 0.03, y: 0.61, width: 0.36, height: 0.36 } },
  { value: "corner-br",   labelKey: "studio.position.bottomRight", icon: "◻", box: { x: 0.61, y: 0.61, width: 0.36, height: 0.36 } },
];

export interface PositionPresetsProps {
  position: WidgetPosition;
  onApply: (box: { x: number; y: number; width: number; height: number }) => void;
}

const EPSILON = 0.005;

function matches(p: WidgetPosition, b: PositionPreset["box"]): boolean {
  return (
    Math.abs(p.x - b.x) < EPSILON &&
    Math.abs(p.y - b.y) < EPSILON &&
    Math.abs(p.width - b.width) < EPSILON &&
    Math.abs(p.height - b.height) < EPSILON
  );
}

export default function PositionPresets({ position, onApply }: PositionPresetsProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-9 gap-0.5">
      {POSITION_PRESETS.map((p) => {
        const active = matches(position, p.box);
        return (
          <button
            key={p.value}
            type="button"
            title={t(p.labelKey)}
            aria-label={t(p.labelKey)}
            aria-pressed={active}
            onClick={() => onApply(p.box)}
            className={cn(
              "flex h-7 items-center justify-center rounded border text-xs transition-colors",
              active
                ? "border-brand-primary bg-brand-primary/20 text-brand-primary"
                : "border-border text-muted-foreground hover:border-brand-primary/40",
            )}
          >
            {p.icon}
          </button>
        );
      })}
    </div>
  );
}
