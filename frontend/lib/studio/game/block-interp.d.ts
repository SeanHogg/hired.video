/**
 * Type declarations for `block-interp.js` (gap #1007).
 *
 * The plain-JS file is the SSoT for the visual-block interpreter — it's
 * embedded into the exported HTML5 ZIP bundle via Vite's `?raw` query.
 * This `.d.ts` makes TS consumers (the editor playtest path) read the
 * exports with full type-checking.
 */

import type { BlockExpr, BlockStmt, BlockValue, BlockVariable, ScriptProgram } from "../../../../shared/game-blocks.js";

export interface ScriptCtx {
  now: number;
  levelMountTs?: number;
  mouse?: { x: number; y: number };
  heldKeys?: Set<string>;
  spritesById?: Map<string, { id: string; x: number; y: number; source: { scriptProgram?: ScriptProgram } }>;
  spriteVars?: Map<string, Record<string, BlockValue>>;
  globalVars?: Record<string, BlockValue>;
  gotoLevel?: (levelId: string) => void;
  playSound?: (assetId: string) => void;
  broadcast?: (name: string) => void;
  /** Editor single-step toggle — flip to true to bail out of `forever`
   *  after the current iteration. */
  stopForever?: boolean;
}

export interface RuntimeSprite {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  visible?: boolean;
  message?: string;
  messageUntilTs?: number;
  source: {
    id: string;
    scriptProgram?: ScriptProgram;
  };
}

export function evalExpr(expr: BlockExpr | null | undefined, sprite: RuntimeSprite, ctx: ScriptCtx): BlockValue;

export function executeStmts(
  sprite: RuntimeSprite,
  stmts: BlockStmt[] | null | undefined,
  ctx: ScriptCtx,
): "ok" | "level-changed";

export function fireProgramEvents(
  sprite: RuntimeSprite,
  eventKind: string,
  eventArgs: Record<string, unknown> | null | undefined,
  ctx: ScriptCtx,
): void;

export function seedScriptVars(sprites: RuntimeSprite[], ctx: ScriptCtx): void;

export function seedGlobalVars(globalVariables: BlockVariable[] | undefined, ctx: ScriptCtx): void;
