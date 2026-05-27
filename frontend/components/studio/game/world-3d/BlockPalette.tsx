/**
 * BlockPalette — the edit-mode toolbar for picking which entity kind
 * the next ground-click will drop. Self-gated (renders only when its
 * parent passes `mode === "edit"`); no `canX` prop drilling per DRY.
 */

import { cn } from "@/lib/utils";
import type { World3DEntityKind } from "@shared/game-state";

interface PaletteEntry {
  kind: World3DEntityKind;
  label: string;
  /** Single emoji glyph — keeps the palette icon-light without
   *  pulling another icon library. The 3D editor swaps these for
   *  rendered thumbnails when the geometry library lands (gap #1634). */
  glyph: string;
}

const PALETTE: PaletteEntry[] = [
  { kind: "block", label: "Block", glyph: "🧱" },
  { kind: "platform", label: "Platform", glyph: "▭" },
  { kind: "ramp", label: "Ramp", glyph: "◢" },
  { kind: "sphere", label: "Ball", glyph: "⚽" },
  { kind: "collectible", label: "Coin", glyph: "🪙" },
  { kind: "goal", label: "Goal", glyph: "🏁" },
  { kind: "hazard", label: "Hazard", glyph: "🔥" },
  { kind: "light", label: "Light", glyph: "💡" },
];

interface BlockPaletteProps {
  activeKind: World3DEntityKind | null;
  /** Click handler — receives the kind the user picked, or `null` when
   *  they clicked the active kind again (toggle off → "select" mode,
   *  next ground-click does nothing). */
  onPick: (kind: World3DEntityKind | null) => void;
  className?: string;
}

export default function BlockPalette({
  activeKind,
  onPick,
  className,
}: BlockPaletteProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-md border border-border bg-background/95 p-1 shadow-md backdrop-blur",
        className,
      )}
      role="toolbar"
      aria-label="3D world block palette"
    >
      {PALETTE.map((entry) => {
        const active = entry.kind === activeKind;
        return (
          <button
            key={entry.kind}
            type="button"
            onClick={() => onPick(active ? null : entry.kind)}
            className={cn(
              "flex h-10 w-12 flex-col items-center justify-center gap-0.5 rounded text-[10px] font-medium transition-colors",
              active
                ? "bg-fuchsia-600 text-white shadow-inner"
                : "bg-muted text-foreground hover:bg-muted-foreground/10",
            )}
            aria-pressed={active}
            title={`Place ${entry.label.toLowerCase()}`}
          >
            <span className="text-base leading-none" aria-hidden="true">
              {entry.glyph}
            </span>
            <span>{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}
