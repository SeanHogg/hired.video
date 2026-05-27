/**
 * EntityPaletteLeft — left-rail palette for `engine === "world-3d"`
 * projects. Mirrors the visual shape of [SpritePalette](../SpritePalette.tsx)
 * (the 2D mini-game equivalent) so the studio's left-rail chrome stays
 * consistent across engines: grouped sections, grid of tiles, captions.
 *
 * Interaction = drag-and-drop. Each tile is a drag source; dropping
 * onto the 3D canvas places that kind at the cursor's world-space hit
 * point. The drop receiver lives in
 * [GameStage3D.tsx](../GameStage3D.tsx) (it's the only place that knows
 * the R3F camera + ground plane geometry needed to raycast the drop).
 *
 * Single source for the kind catalog — no fork between palette + drop
 * dispatch. The [world-3d-edit.ts](@/lib/studio/game/world-3d-edit)
 * `ENTITY_KIND_DEFAULTS` registry is the SSoT for per-kind defaults
 * (scale, color, physics); this file is the SSoT for per-kind UI (label,
 * glyph, group). Adding a new kind is one entry in each.
 */

import { cn } from "@/lib/utils";
import type { World3DEntityKind } from "@shared/game-state";

interface PaletteEntry {
  kind: World3DEntityKind;
  label: string;
  /** Single emoji glyph — same convention the legacy top-overlay
   *  palette used. Swapped to rendered thumbnails when the 3D
   *  geometry-thumbnail pipeline lands (tracked under gap #1639). */
  glyph: string;
}

type GroupId = "building" | "triggers" | "props" | "fx";

const GROUP_LABELS: Record<GroupId, string> = {
  building: "Building",
  triggers: "Triggers",
  props: "Props",
  fx: "FX",
};

const GROUPS: Record<GroupId, PaletteEntry[]> = {
  building: [
    { kind: "block", label: "Block", glyph: "🧱" },
    { kind: "platform", label: "Platform", glyph: "▭" },
    { kind: "ramp", label: "Ramp", glyph: "◢" },
  ],
  triggers: [
    { kind: "collectible", label: "Coin", glyph: "🪙" },
    { kind: "goal", label: "Goal", glyph: "🏁" },
    { kind: "hazard", label: "Hazard", glyph: "🔥" },
  ],
  props: [{ kind: "sphere", label: "Ball", glyph: "⚽" }],
  fx: [{ kind: "light", label: "Light", glyph: "💡" }],
};

/** DataTransfer MIME type for the drag payload. The drop receiver in
 *  GameStage3D reads from this key. Custom type — not a standard MIME
 *  — so a stray text/plain drop from outside the app never accidentally
 *  places an entity. */
export const ENTITY_DRAG_MIME = "application/x-world3d-kind";

export default function EntityPaletteLeft() {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-2 py-2">
      <p className="px-1 pb-2 text-[10px] text-muted-foreground">
        Drag a piece into the world.
      </p>
      {(Object.keys(GROUPS) as GroupId[]).map((group) => {
        const entries = GROUPS[group];
        if (entries.length === 0) return null;
        return (
          <section key={group} className="mb-3">
            <h4 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {GROUP_LABELS[group]}
            </h4>
            <div className="grid grid-cols-3 gap-1.5">
              {entries.map((entry) => (
                <PaletteTile key={entry.kind} entry={entry} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PaletteTile({ entry }: { entry: PaletteEntry }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(ENTITY_DRAG_MIME, entry.kind);
        // Also set text/plain so a drop on the OS desktop / a textarea
        // gracefully degrades to the kind name instead of erroring.
        e.dataTransfer.setData("text/plain", entry.kind);
      }}
      className={cn(
        "flex aspect-square flex-col items-center justify-center gap-0.5 rounded border border-border bg-muted/40 text-[10px] font-medium",
        "cursor-grab transition-colors hover:bg-muted",
        "active:cursor-grabbing",
      )}
      title={`Drag ${entry.label.toLowerCase()} into the world`}
      role="button"
      aria-label={`Drag ${entry.label}`}
    >
      <span className="text-xl leading-none" aria-hidden="true">
        {entry.glyph}
      </span>
      <span>{entry.label}</span>
    </div>
  );
}
