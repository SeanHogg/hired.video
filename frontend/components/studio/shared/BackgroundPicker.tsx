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
  className?: string;
}

export default function BackgroundPicker({
  activeBgValue,
  onSelect,
  className,
}: BackgroundPickerProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
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
            className={cn(
              "group flex flex-col items-stretch gap-1 rounded-md border bg-card p-1 transition hover:border-brand-purple",
              active
                ? "border-brand-purple ring-2 ring-brand-purple/30"
                : "border-border",
            )}
          >
            <div
              className="h-10 w-full rounded"
              style={{ background: preset.preview }}
            />
            <span className="truncate text-[10px] text-muted-foreground">
              {preset.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
