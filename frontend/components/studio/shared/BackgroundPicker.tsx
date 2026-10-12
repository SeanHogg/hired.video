/**
 * Background preset picker — the gradient/solid swatch grid shared
 * between the v1 classic sidebar and v2's Design panel.
 *
 * The catalog lives in `lib/studio/visual-themes.ts` (single source of
 * truth). Application logic is owned by the parent — picker emits the
 * selected preset, parent decides whether to set
 * `video.theme.background` (v1) or mutate a scene's `backgroundColor`
 * (v2).
 */
import { BG_PRESETS, type BgPreset } from "@/lib/studio/visual-themes";
import { cn } from "@/lib/utils";
import { writeDragPayload } from "@/lib/studio/editor-v2/drag-protocol";

export interface BackgroundPickerProps {
  activeBgValue?: string | null;
  onSelect: (preset: BgPreset) => void;
  /** Hex of the applied background — rendered in the mono caption under
   *  the grid ("#0F172A · Midnight"). Omit to show the preset name only. */
  activeHex?: string | null;
  className?: string;
}

/** 4-column grid of square swatch tiles (design system: rounded-xl,
 *  selected ringed in primary). Names live in each tile's title/aria-label
 *  and in ONE mono caption under the grid instead of under every tile. */
export default function BackgroundPicker({
  activeBgValue,
  onSelect,
  activeHex,
  className,
}: BackgroundPickerProps) {
  const activePreset = BG_PRESETS.find((p) => p.value === activeBgValue);
  const caption = [activeHex?.toUpperCase(), activePreset?.label]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="grid grid-cols-4 gap-1.5">
        {BG_PRESETS.map((preset) => {
          const active = preset.value === activeBgValue;
          return (
            <button
              key={preset.value}
              type="button"
              draggable
              onDragStart={(e) =>
                writeDragPayload(e.dataTransfer, {
                  kind: "background",
                  data: preset.value,
                })
              }
              onClick={() => onSelect(preset)}
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={active}
              className={cn(
                "aspect-square w-full max-w-14 justify-self-center rounded-xl border transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-2 border-primary"
                  : "border-border",
              )}
              style={{ background: preset.preview }}
            />
          );
        })}
      </div>
      {caption && (
        <span className="font-mono text-[11px] text-muted-foreground">{caption}</span>
      )}
    </div>
  );
}
