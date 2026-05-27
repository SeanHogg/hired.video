/**
 * Game seeds — per-template `GameState` factories for `mediaKind: "game"`
 * projects. Parallel to `frontend/lib/studio/editor-v2/template-seeds.ts`
 * (which seeds `CanvasState` for Timeline kinds).
 *
 * Each entry returns a fresh `GameState` populated with the level /
 * sprite shape the chosen game template starts from. Per PRD §1.2 the
 * canvas-runtime extensibility model puts game on equal footing with
 * Timeline kinds — every kind gets its own seed registry, dispatched
 * by `seedTemplate(template)` in `lib/studio/template-dispatch.ts`.
 *
 * Seeded sprites pick from `BUILTIN_SPRITES` so projects open with
 * actual visuals (not the placeholder rectangle fallback). Every
 * referenced built-in is also dropped into `state.assets` so the
 * runtime can resolve them via the same asset-loader path that
 * user-uploaded R2 sprites use (DRY across asset sources). Adding a
 * new game template is one entry here + (optionally) new entries in
 * `sprite-library.ts` for any custom visuals it needs.
 */

import {
  emptyGameState,
  empty3DGameState,
  type GameAsset,
  type GameSprite,
  type GameState,
} from "@shared/game-state";
import type { ContentTemplate } from "@/components/studio/templates/catalog";
import { addEntity } from "./world-3d-edit";
import {
  BUILTIN_SPRITES,
  pickBuiltinSprite,
  spriteToAsset,
} from "./sprite-library";

export function seedGameFromTemplate(
  templateId: string | null | undefined,
): GameState {
  if (!templateId) return emptyGameState();
  const seed = GAME_SEEDS[templateId as ContentTemplate];
  if (!seed) return emptyGameState();
  return seed();
}

// ───────────────────────────────────────────────────────────────────────────
// Per-template seeds. Each pulls its sprite visuals from the built-in
// catalog so the canvas paints real artwork on first paint.
// ───────────────────────────────────────────────────────────────────────────

/** Build a sprite that references a built-in by id, adopting the
 *  built-in's recommended `width` / `height` as defaults. Falls back
 *  to whatever values are passed when the id doesn't resolve (defensive
 *  — the seed file + sprite library evolve together, but a missing id
 *  shouldn't crash the chooser). */
function builtinSprite(
  base: Omit<GameSprite, "assetId" | "width" | "height"> & {
    assetId: string;
    width?: number;
    height?: number;
  },
): GameSprite {
  const builtin = pickBuiltinSprite(base.assetId);
  return {
    id: base.id,
    assetId: base.assetId,
    x: base.x,
    y: base.y,
    width: base.width ?? builtin?.width ?? 64,
    height: base.height ?? builtin?.height ?? 64,
    behavior: base.behavior,
    params: base.params,
  };
}

/** Collect a deduped `GameAsset[]` for every built-in sprite the seed
 *  references. Saves callers from manually keeping the `assets`
 *  manifest in sync with the sprite list — they just declare what they
 *  use and the helper figures out the asset entries. */
function assetsFor(ids: string[]): GameAsset[] {
  const seen = new Set<string>();
  const out: GameAsset[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const builtin = pickBuiltinSprite(id);
    if (!builtin) continue;
    seen.add(id);
    out.push(spriteToAsset(builtin));
  }
  return out;
}

const GAME_SEEDS: Partial<Record<ContentTemplate, () => GameState>> = {
  endless_runner: () => {
    const base = emptyGameState({ width: 1280, height: 720, fps: 60 });
    base.assets = assetsFor([
      "builtin:player-yellow",
      "builtin:tile-grass",
      "builtin:obstacle-cactus",
    ]);
    base.levels[0] = {
      id: "level-1",
      label: "Run!",
      backgroundColor: "#0ea5e9",
      sprites: [
        builtinSprite({
          id: "player",
          assetId: "builtin:player-yellow",
          x: 120,
          y: 520,
          behavior: "platformer-player",
          params: { jumpPower: 600, runSpeed: 280 },
        }),
        builtinSprite({
          id: "ground",
          assetId: "builtin:tile-grass",
          x: 0,
          y: 640,
          width: 1280,
          height: 80,
          behavior: "static",
        }),
        builtinSprite({
          id: "obstacle-1",
          assetId: "builtin:obstacle-cactus",
          x: 900,
          y: 568,
          behavior: "scroll-left",
          params: { speed: 280 },
        }),
      ],
    };
    return base;
  },

  quiz_game: () => {
    const base = emptyGameState({ width: 1280, height: 720, fps: 30 });
    base.assets = assetsFor(["builtin:button"]);
    base.levels = [
      {
        id: "menu",
        label: "Title screen",
        backgroundColor: "#1e1b4b",
        sprites: [
          builtinSprite({
            id: "start-button",
            assetId: "builtin:button",
            x: 480,
            y: 440,
            behavior: "quiz-answer",
            params: { text: "Start", correct: true },
          }),
        ],
        nextLevelId: "q1",
      },
      {
        id: "q1",
        label: "Question 1",
        backgroundColor: "#0f172a",
        sprites: [
          builtinSprite({
            id: "answer-a",
            assetId: "builtin:button",
            x: 120,
            y: 320,
            behavior: "quiz-answer",
            params: { text: "A. Jupiter", correct: false },
          }),
          builtinSprite({
            id: "answer-b",
            assetId: "builtin:button",
            x: 680,
            y: 320,
            behavior: "quiz-answer",
            params: { text: "B. Saturn", correct: true },
          }),
        ],
      },
    ];
    base.startLevelId = "menu";
    return base;
  },

  memory_match: () => {
    const base = emptyGameState({ width: 1280, height: 720, fps: 30 });
    base.assets = assetsFor(["builtin:card-back"]);
    base.levels[0] = {
      id: "board",
      label: "Memory board",
      backgroundColor: "#064e3b",
      sprites: Array.from({ length: 16 }, (_, i) =>
        builtinSprite({
          id: `card-${i}`,
          assetId: "builtin:card-back",
          x: 280 + (i % 4) * 180,
          y: 100 + Math.floor(i / 4) * 140,
          behavior: "memory-card",
          params: { pairId: Math.floor(i / 2) },
        }),
      ),
    };
    return base;
  },

  // 3D world seed (gap #1633). Empty Roblox-style starter world with
  // a few scattered platforms + a goal block — enough to let the
  // playtest first-person controller actually do something on first
  // open, but light enough that the AI agent (Phase 5) has room to
  // build on top without competing with seeded geometry.
  game_3d_world: () => {
    let state = empty3DGameState({ width: 1280, height: 720, fps: 60 });
    // Small platforms forming a step-up path
    state = addEntity(state, {
      kind: "platform",
      position: [4, 1, 0],
      scale: [3, 0.5, 3],
      color: "#a3a3a3",
    }).state;
    state = addEntity(state, {
      kind: "platform",
      position: [8, 2.5, 0],
      scale: [3, 0.5, 3],
      color: "#9ca3af",
    }).state;
    state = addEntity(state, {
      kind: "platform",
      position: [12, 4, 0],
      scale: [3, 0.5, 3],
      color: "#94a3b8",
    }).state;
    // A goal at the top of the stairs
    state = addEntity(state, {
      kind: "goal",
      position: [12, 5.5, 0],
      scale: [2, 2, 2],
      color: "#22c55e",
      tag: "level-goal",
    }).state;
    // A collectible coin near the start
    state = addEntity(state, {
      kind: "collectible",
      position: [-3, 1, -2],
      scale: [0.6, 0.6, 0.6],
      color: "#facc15",
      tag: "coin",
    }).state;
    return state;
  },
};

/** Test-only export — `BUILTIN_SPRITES` is the catalog; this is the
 *  set of ids referenced by the seeds. Kept here so a "library lookup
 *  drift" regression test can pin that every seed references a real
 *  built-in. */
export const SEED_REFERENCED_BUILTINS = [
  "builtin:player-yellow",
  "builtin:tile-grass",
  "builtin:obstacle-cactus",
  "builtin:button",
  "builtin:card-back",
] as const;

// Keep a touchpoint to BUILTIN_SPRITES so the cross-reference test
// can assert at runtime that every SEED_REFERENCED_BUILTINS id resolves.
void BUILTIN_SPRITES;
