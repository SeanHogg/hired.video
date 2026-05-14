/**
 * FontPicker — typography preset selector. Each item previews itself in
 * its own font so users see the choice before clicking. Catalog lives
 * in `lib/studio/font-catalog.ts` (single source of truth).
 */
import { FONT_PRESETS, type FontPreset } from "@/lib/studio/font-catalog";
import { cn } from "@/lib/utils";

export interface FontPickerProps {
  activeFontId: string | null;
  onSelect: (preset: FontPreset) => void;
  className?: string;
}

export default function FontPicker({
  activeFontId,
  onSelect,
  className,
}: FontPickerProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {FONT_PRESETS.map((preset) => {
        const active = preset.id === activeFontId;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset)}
            className={cn(
              "flex items-center justify-between rounded-md border bg-card px-2 py-2 text-left transition hover:border-brand-purple",
              active
                ? "border-brand-purple ring-2 ring-brand-purple/30"
                : "border-border",
            )}
            style={{ fontFamily: preset.family }}
          >
            <span className="text-sm">{preset.label}</span>
            <span className="text-[10px] text-muted-foreground">Aa</span>
          </button>
        );
      })}
    </div>
  );
}
