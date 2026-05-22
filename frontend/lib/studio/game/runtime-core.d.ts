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

import type { GameLevel, GameSprite, GameState } from "@shared/game-state";

export interface RuntimeSprite {
  source: GameSprite;
  x: number;
  y: number;
  vy: number;
  /** For memory-card behavior: whether the user has flipped this card. */
  flipped: boolean;
  /** For quiz-answer behavior: whether this answer has been picked. */
  picked: boolean;
}

export interface RunGameOptions {
  /** "edit" → static layout render, no input. "play" → game loop +
   *  input wired. */
  mode: "edit" | "play";
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

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  level: GameLevel,
  sprites: RuntimeSprite[],
): void;

export function runGame(
  canvas: HTMLCanvasElement,
  state: GameState,
  opts: RunGameOptions,
): RunGameHandle;
