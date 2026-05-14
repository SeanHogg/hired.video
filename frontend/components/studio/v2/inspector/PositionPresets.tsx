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
import { cn } from "@/lib/utils";
import type { WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";

export interface PositionPreset {
  value: string;
  label: string;
  icon: string;
  /** Fractional (0..1) box — already in canvas-state units, no `/100`
   *  conversion needed at the call site. */
  box: { x: number; y: number; width: number; height: number };
}

export const POSITION_PRESETS: PositionPreset[] = [
  { value: "full",        label: "Full",         icon: "■", box: { x: 0,    y: 0,    width: 1,    height: 1    } },
  { value: "half-left",   label: "Half left",    icon: "◧", box: { x: 0,    y: 0,    width: 0.5,  height: 1    } },
  { value: "half-right",  label: "Half right",   icon: "◨", box: { x: 0.5,  y: 0,    width: 0.5,  height: 1    } },
  { value: "small-left",  label: "Small left",   icon: "◐", box: { x: 0.05, y: 0.20, width: 0.42, height: 0.6  } },
  { value: "small-right", label: "Small right",  icon: "◑", box: { x: 0.53, y: 0.20, width: 0.42, height: 0.6  } },
  { value: "corner-tl",   label: "Top left",     icon: "◸", box: { x: 0.03, y: 0.03, width: 0.36, height: 0.36 } },
  { value: "corner-tr",   label: "Top right",    icon: "◹", box: { x: 0.61, y: 0.03, width: 0.36, height: 0.36 } },
  { value: "corner-bl",   label: "Bottom left",  icon: "◺", box: { x: 0.03, y: 0.61, width: 0.36, height: 0.36 } },
  { value: "corner-br",   label: "Bottom right", icon: "◻", box: { x: 0.61, y: 0.61, width: 0.36, height: 0.36 } },
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
  return (
    <div className="grid grid-cols-9 gap-0.5">
      {POSITION_PRESETS.map((p) => {
        const active = matches(position, p.box);
        return (
          <button
            key={p.value}
            type="button"
            title={p.label}
            aria-label={p.label}
            aria-pressed={active}
            onClick={() => onApply(p.box)}
            className={cn(
              "flex h-7 items-center justify-center rounded border text-xs transition-colors",
              active
                ? "border-brand-purple bg-brand-purple/20 text-brand-purple"
                : "border-border text-muted-foreground hover:border-brand-purple/40",
            )}
          >
            {p.icon}
          </button>
        );
      })}
    </div>
  );
}
