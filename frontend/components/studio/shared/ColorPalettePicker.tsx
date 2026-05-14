/**
 * ColorPalettePicker — 4-chip palette editor shared by v1 (writes
 * `script.video.theme.colorPalette`) and v2 (writes
 * `CanvasState.colorPalette`). Editing one chip emits a new 4-tuple so
 * consumers can do a single set-state.
 *
 * Per the DRY rule: every "customise the palette" surface mounts THIS.
 * No parent re-implements the chip grid or the reset behaviour.
 */
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ColorPalette = [string, string, string, string];

export const DEFAULT_PALETTE: ColorPalette = [
  "#0f172a", // primary
  "#0ea5e9", // accent
  "#1e293b", // surface
  "#ffffff", // contrast / foreground
];

const SLOT_LABELS: Record<number, string> = {
  0: "Primary",
  1: "Accent",
  2: "Surface",
  3: "Contrast",
};

export interface ColorPalettePickerProps {
  palette: ColorPalette | null;
  onChange: (next: ColorPalette) => void;
  className?: string;
}

export default function ColorPalettePicker({
  palette,
  onChange,
  className,
}: ColorPalettePickerProps) {
  const current = palette ?? DEFAULT_PALETTE;

  function patch(idx: number, color: string) {
    const next = [...current] as ColorPalette;
    next[idx] = color;
    onChange(next);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {current.map((color, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div className="w-16">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {SLOT_LABELS[idx]}
            </Label>
          </div>
          <input
            type="color"
            value={color}
            onChange={(e) => patch(idx, e.target.value)}
            className="h-7 w-12 cursor-pointer rounded border border-input bg-background"
            aria-label={`${SLOT_LABELS[idx]} colour`}
          />
          <input
            type="text"
            value={color}
            onChange={(e) => patch(idx, e.target.value)}
            className="h-7 flex-1 rounded border border-input bg-background px-2 font-mono text-[10px]"
            aria-label={`${SLOT_LABELS[idx]} hex value`}
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 self-start text-[10px]"
        onClick={() => onChange(DEFAULT_PALETTE)}
      >
        Reset palette
      </Button>
    </div>
  );
}
