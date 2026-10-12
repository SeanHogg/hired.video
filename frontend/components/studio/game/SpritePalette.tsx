/**
 * SpritePalette — left-bottom panel for game-kind projects. Parallel
 * to `<WidgetPalette>` for Timeline-runtime kinds: same shell slot,
 * same "click a tile to add it to the active container" interaction
 * model. Clicking a sprite tile appends a new `GameSprite` to the
 * active level with that built-in sprite as its asset + sensible
 * default placement.
 *
 * Built-in sprites come from `BUILTIN_SPRITES` (the curated SVG
 * catalog) — categorised so the palette groups by Characters /
 * Obstacles / Tiles / Collectibles / UI. Adding a new built-in is
 * one entry in `sprite-library.ts`; it lights up here automatically.
 *
 * Per the DRY rule: the actual mutation (add sprite + copy asset
 * into `state.assets`) lives in `addSprite` + `assignSpriteAsset` in
 * `game-state-edit.ts`. This component composes those helpers; it
 * doesn't re-implement the asset-copying logic.
 */
import { useMemo } from "react";
import { Upload } from "lucide-react";
import type { GameState } from "@shared/game-state";
import {
  BUILTIN_SPRITES,
  type BuiltinSprite,
  type SpriteCategory,
} from "@/lib/studio/game/sprite-library";
import {
  addCustomSpriteAsset,
  addSprite,
  assignSpriteAsset,
  updateSprite,
  type Behavior,
} from "@/lib/studio/game/game-state-edit";
import MediaPicker, { type PickedMedia } from "@/components/shared/MediaPicker";

const CATEGORY_LABELS: Record<SpriteCategory, string> = {
  character: "Characters",
  obstacle: "Obstacles",
  tile: "Tiles",
  collectible: "Collectibles",
  ui: "UI",
};

// Recommended starting behavior per sprite category — chosen so adding
// a character sprite from the palette arrives play-ready as a platformer
// player, obstacles auto-scroll, etc. Users can swap behaviors in the
// right-rail inspector.
const CATEGORY_DEFAULT_BEHAVIOR: Record<SpriteCategory, Behavior | null> = {
  character: "platformer-player",
  obstacle: "scroll-left",
  tile: "static",
  collectible: null,
  ui: null,
};

export interface SpritePaletteProps {
  gameState: GameState;
  onChange: (next: GameState) => void;
  activeLevelId: string | null;
  onSelectSprite: (spriteId: string | null) => void;
}

export default function SpritePalette({
  gameState,
  onChange,
  activeLevelId,
  onSelectSprite,
}: SpritePaletteProps) {
  const grouped = useMemo(() => {
    const byCat = new Map<SpriteCategory, BuiltinSprite[]>();
    for (const sprite of BUILTIN_SPRITES) {
      const arr = byCat.get(sprite.category) ?? [];
      arr.push(sprite);
      byCat.set(sprite.category, arr);
    }
    return byCat;
  }, []);

  function handlePick(sprite: BuiltinSprite) {
    if (!activeLevelId) return;
    const behavior = CATEGORY_DEFAULT_BEHAVIOR[sprite.category];
    const added = addSprite(gameState, activeLevelId, { behavior });
    // `addSprite` returns the post-add state + the new sprite. Layer
    // `assignSpriteAsset` on top so the new sprite arrives with the
    // chosen built-in's url + size already populated.
    const withAsset = assignSpriteAsset(added.state, activeLevelId, added.sprite.id, sprite);
    onChange(withAsset);
    onSelectSprite(added.sprite.id);
  }

  // Custom sprite uploaded via the shared MediaPicker — same asset
  // pipeline as built-ins (drops into state.assets via the canonical
  // helper) so the runtime can't tell the two apart at draw time. The
  // user gets the existing R2 upload + library + AI tabs the rest of
  // the studio already uses (DRY: one asset-picker chrome serves every
  // surface that wants media).
  function handleCustomPick(picked: PickedMedia) {
    if (!activeLevelId) return;
    if (picked.mediaType !== "image") return;
    // Stable id derived from the URL — re-picking the same upload
    // doesn't double-add the asset. `addCustomSpriteAsset` is
    // idempotent on id so this is safe to call repeatedly.
    const customId = `custom:${picked.url}`;
    const width = picked.width ?? 96;
    const height = picked.height ?? 96;
    let next = addCustomSpriteAsset(gameState, { id: customId, url: picked.url, width, height });
    const added = addSprite(next, activeLevelId, { behavior: null });
    next = added.state;
    // Wire the sprite to the custom asset id + adopt the picked
    // dimensions so the canvas paints at the upload's natural size.
    next = updateSprite(next, activeLevelId, added.sprite.id, {
      assetId: customId,
      width,
      height,
    });
    onChange(next);
    onSelectSprite(added.sprite.id);
  }

  if (!activeLevelId) {
    return (
      <div className="flex h-full items-center justify-center px-3 py-4 text-center text-xs text-muted-foreground">
        Pick a level on the left to start placing sprites.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-2 py-2">
      <p className="px-1 pb-2 text-[10px] text-muted-foreground">
        Click a sprite to add it to the active level.
      </p>
      {(Object.keys(CATEGORY_LABELS) as SpriteCategory[]).map((cat) => {
        const sprites = grouped.get(cat);
        if (!sprites || sprites.length === 0) return null;
        return (
          <section key={cat} className="mb-3">
            <h4 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {CATEGORY_LABELS[cat]}
            </h4>
            <div className="grid grid-cols-3 gap-1.5">
              {sprites.map((sprite) => (
                <SpriteTile key={sprite.id} sprite={sprite} onPick={() => handlePick(sprite)} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Custom upload — opens the shared MediaPicker (Upload / Library /
          Stock / AI tabs) and threads the picked image through the same
          asset pipeline as built-ins. Lives at the bottom of the
          palette so the built-in catalog is always primary. */}
      <section className="mt-2 border-t border-border pt-3">
        <h4 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Custom
        </h4>
        <MediaPicker
          accept="image"
          onPick={handleCustomPick}
          title="Pick a sprite image"
          triggerLabel="Upload sprite"
          trigger={
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-teal-300 bg-teal-50/30 px-2 py-3 text-[11px] text-teal-700 hover:bg-teal-50"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload or pick image
            </button>
          }
        />
      </section>
    </div>
  );
}

/** Asset drag MIME — payload is JSON `{ url, label }`. The 3D-world
 *  drop receiver ([GameStage3D.tsx](./GameStage3D.tsx)) reads this so
 *  sprites can be dragged from the left rail directly into the 3D
 *  scene as textured entities. The 2D editor uses the same SpriteTile
 *  with click-to-add — both interactions coexist on the same element
 *  (DRY: one tile, two consumers). */
export const ASSET_DRAG_MIME = "application/x-world3d-asset";

function SpriteTile({ sprite, onPick }: { sprite: BuiltinSprite; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(
          ASSET_DRAG_MIME,
          JSON.stringify({ url: sprite.url, label: sprite.label }),
        );
        e.dataTransfer.setData("text/plain", sprite.label);
      }}
      title={`${sprite.label} — click to add (2D) or drag into the 3D world`}
      className="flex flex-col items-center gap-1 rounded border border-border bg-card p-1.5 transition-colors hover:border-teal-400 hover:bg-teal-50/40"
    >
      <div className="flex h-12 w-full items-center justify-center overflow-hidden rounded bg-muted/40">
        <img
          src={sprite.url}
          alt=""
          className="max-h-12 max-w-full object-contain"
          // SVG data URIs scale crisply; native size is fine.
          draggable={false}
        />
      </div>
      <span className="line-clamp-1 text-[10px] text-muted-foreground">
        {sprite.label}
      </span>
    </button>
  );
}
