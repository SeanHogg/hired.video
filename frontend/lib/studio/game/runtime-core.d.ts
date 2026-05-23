/**
 * TypeScript declarations for `runtime-core.js`. Lives alongside the JS
 * file (mirrors the `.d.ts` pattern shared/third-party JS libs use) so TS
 * consumers (runtime.ts, GameStage.tsx, tests) get full type-checking
 * even though the implementation is plain JS.
 *
 * The JS implementation is the SoT for behavior; this file restates the
 * signatures TS needs to type-check imports. If you add a new exported
 * function in runtime-core.js, declare its signature here too.
 */

import type {
  BlockAction,
  GameAsset,
  GameLevel,
  GameSprite,
  GameState,
} from "@shared/game-state";

export interface RuntimeSprite {
  source: GameSprite;
  x: number;
  y: number;
  /** Runtime override of source.width / height — block-script
   *  `set-property width` mutates this without touching the authored
   *  data, so exiting play mode restores the authored bbox. */
  width: number;
  height: number;
  vy: number;
  /** For memory-card behavior: whether the user has flipped this card. */
  flipped: boolean;
  /** For quiz-answer behavior: whether this answer has been picked. */
  picked: boolean;
  /** Block-script `show` / `hide` action toggles this; drawFrame skips
   *  hidden sprites entirely. */
  visible: boolean;
  /** Animation-driven render multipliers — applyAnimation() updates
   *  these each tick based on onMount spec progress. */
  alpha: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  /** Per-sprite mount timestamp — animations use this as t=0; the
   *  every-seconds trigger uses it as the initial lastFired value. */
  mountTs: number;
  /** Block-script `set-message` action sets this + the expiry; drawFrame
   *  renders a small pill while messageUntilTs is in the future. */
  message: string | null;
  messageUntilTs: number;
  /** One-shot guard so on-level-mount fires exactly once per sprite. */
  hasFiredOnMount: boolean;
  /** Per-rule lastFired timestamp for every-seconds triggers. Indexed
   *  by rule id so the runtime can support multiple every-seconds
   *  rules on the same sprite without them sharing a timer. */
  everySecondsLastFiredTs: Record<string, number>;
}

export interface ScriptContext {
  gotoLevel: (levelId: string) => void;
  now: number;
}

export interface RunGameOptions {
  /** "edit" → static layout render, no input. "play" → game loop +
   *  input wired. */
  mode: "edit" | "play";
  /** Editor-only override — render this level instead of the
   *  GameState's startLevelId. Falls back to startLevelId when unset
   *  or the id doesn't resolve. The export bundle never passes this
   *  so the live game still mounts the authored start level. */
  activeLevelId?: string;
  /** Editor-only — draws a dashed selection outline on the sprite
   *  with this id. Unset = no outline. */
  selectedSpriteId?: string | null;
}

export interface RunGameHandle {
  /** Cancels the rAF loop + removes event listeners. Idempotent. */
  cleanup: () => void;
}

export function findStartLevel(state: GameState): GameLevel | null;

export function tintForBehavior(behavior: string | null): { fill: string; text: string };

export function updateSprite(
  sprite: RuntimeSprite,
  dt: number,
  keys: Set<string>,
  worldWidth: number,
): void;

export interface AssetCache {
  /** Returns the loaded `HTMLImageElement` for the asset id, or null
   *  if the asset hasn't loaded yet (or doesn't resolve). The cache
   *  starts the load on first call so subsequent frames pick up the
   *  bitmap automatically. */
  get(assetId: string | null | undefined): HTMLImageElement | null;
}

export function createAssetCache(assets: readonly GameAsset[]): AssetCache;

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  level: GameLevel,
  sprites: RuntimeSprite[],
  assets: readonly GameAsset[],
  opts?: {
    mode?: "edit" | "play";
    assetCache?: AssetCache;
    selectedSpriteId?: string | null;
  },
): void;

export function runGame(
  canvas: HTMLCanvasElement,
  state: GameState,
  opts: RunGameOptions,
): RunGameHandle;

export function fireRules(
  sprite: RuntimeSprite,
  eventKind: string,
  eventArgs: { key?: string } | null,
  ctx: ScriptContext,
): void;

export function applyAnimation(sprite: RuntimeSprite, ts: number): void;
