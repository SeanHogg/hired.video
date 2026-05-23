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
import type { GameState } from "@shared/game-state";
import {
  BUILTIN_SPRITES,
  type BuiltinSprite,
  type SpriteCategory,
} from "@/lib/studio/game/sprite-library";
import {
  addSprite,
  assignSpriteAsset,
  type Behavior,
} from "@/lib/studio/game/game-state-edit";

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
    </div>
  );
}

function SpriteTile({ sprite, onPick }: { sprite: BuiltinSprite; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={sprite.label}
      className="flex flex-col items-center gap-1 rounded border border-border bg-card p-1.5 transition-colors hover:border-fuchsia-400 hover:bg-fuchsia-50/40"
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
