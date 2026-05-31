/**
 * Pure immutable helpers for editing a `GameState`. Parallel to the
 * Timeline runtime's `updateScene` / `updateWidget` family in the v2
 * editor's reducers — kept as standalone pure functions (no React,
 * no DOM) so:
 *   - The game editor UI in `<GameEditor>` consumes them.
 *   - Unit tests cover the mutation rules without mounting React.
 *   - Future agent-tool / undo-stack consumers reuse them without
 *     re-implementing immutability.
 *
 * Every helper returns a NEW `GameState` (never mutates the input).
 * The `defaultLevel` / `emptyGameState` constructors come from
 * `@shared/game-state` so the per-kind seed registries and the editor
 * mutations all converge on one default shape (DRY).
 *
 * Behavior-param defaults live in `BEHAVIOR_PARAM_DEFAULTS` — the
 * editor's sprite inspector reads it to render the right form for the
 * selected behavior, and the runtime in `runtime-core.js` already
 * tolerates missing params via `?? <fallback>`. One source for "what
 * params does behavior X take?".
 */

import {
  defaultLevel,
  type AnimationSpec,
  type BlockAction,
  type BlockRule,
  type BlockTrigger,
  type GameLevel,
  type GameSprite,
  type GameState,
} from "@shared/game-state";
import {
  spriteToAsset,
  type BuiltinSprite,
} from "./sprite-library";

// ─── Level mutations ─────────────────────────────────────────────────────────

export function addLevel(state: GameState, label?: string): {
  state: GameState;
  level: GameLevel;
} {
  const id = nextLevelId(state);
  const level = defaultLevel(id, label ?? `Level ${state.levels.length + 1}`);
  return {
    state: { ...state, levels: [...state.levels, level] },
    level,
  };
}

export function deleteLevel(state: GameState, levelId: string): GameState {
  // Never let the user drop to zero levels — the runtime needs at least
  // one to mount. The editor's delete affordance disables when count === 1.
  if (state.levels.length <= 1) return state;
  const next = state.levels.filter((l) => l.id !== levelId);
  // If the deleted level was the start, retarget at the first surviving
  // level so `findStartLevel()` resolves on next playtest.
  const startLevelId =
    state.startLevelId === levelId ? next[0].id : state.startLevelId;
  return { ...state, levels: next, startLevelId };
}

export function updateLevel(
  state: GameState,
  levelId: string,
  patch: Partial<Omit<GameLevel, "id">>,
): GameState {
  return {
    ...state,
    levels: state.levels.map((l) => (l.id === levelId ? { ...l, ...patch } : l)),
  };
}

export function setStartLevel(state: GameState, levelId: string): GameState {
  // Defensive — refuse to set a startLevelId that doesn't resolve to a
  // real level. Mirrors the runtime's `findStartLevel` defensive
  // fallback so the editor + runtime agree on the validity rule.
  if (!state.levels.some((l) => l.id === levelId)) return state;
  return { ...state, startLevelId: levelId };
}

/** Self-heal a `startLevelId` that doesn't resolve to any level — snap it
 *  to `levels[0]`. Applied on load so legacy projects persisted with a
 *  dangling startLevelId (e.g. seeds that overwrote levels[0] without
 *  updating it) write a valid id back on next save, and the editor's
 *  start-level dropdown stops showing a no-match fallback. No-op when the
 *  id already resolves or the project has no levels (world-3d worlds). */
export function normalizeStartLevelId(state: GameState): GameState {
  if (!state.levels.length) return state;
  if (state.levels.some((l) => l.id === state.startLevelId)) return state;
  return { ...state, startLevelId: state.levels[0].id };
}

// `reorderLevels` was drafted here but removed per the standing dead-
// code rule — no caller today (the editor uses select / delete, not
// drag-to-reorder). Will land alongside the drag-handle UI in #939.

// ─── Sprite mutations ────────────────────────────────────────────────────────

export function addSprite(
  state: GameState,
  levelId: string,
  opts: {
    behavior?: GameSprite["behavior"];
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    assetId?: string;
  } = {},
): { state: GameState; sprite: GameSprite } {
  const level = state.levels.find((l) => l.id === levelId);
  if (!level) {
    // No-op when the level is missing — return the same state so the
    // caller doesn't have to defensively check. The editor's add
    // button only enables when a level is selected so this branch is
    // belt-and-braces.
    return { state, sprite: emptySprite(state, "sprite-orphan", opts) };
  }
  const id = nextSpriteId(level, opts.behavior ?? null);
  const sprite: GameSprite = emptySprite(state, id, opts);
  return {
    state: updateLevel(state, levelId, {
      sprites: [...level.sprites, sprite],
    }),
    sprite,
  };
}

export function deleteSprite(
  state: GameState,
  levelId: string,
  spriteId: string,
): GameState {
  const level = state.levels.find((l) => l.id === levelId);
  if (!level) return state;
  return updateLevel(state, levelId, {
    sprites: level.sprites.filter((s) => s.id !== spriteId),
  });
}

export function updateSprite(
  state: GameState,
  levelId: string,
  spriteId: string,
  patch: Partial<Omit<GameSprite, "id">>,
): GameState {
  const level = state.levels.find((l) => l.id === levelId);
  if (!level) return state;
  return updateLevel(state, levelId, {
    sprites: level.sprites.map((s) =>
      s.id === spriteId ? { ...s, ...patch } : s,
    ),
  });
}

/** Patch one nested behavior param. Behavior params can be sparse — the
 *  runtime reads `params?.runSpeed ?? 200` etc. — so the editor only
 *  writes the override the user touched. */
export function updateSpriteParam(
  state: GameState,
  levelId: string,
  spriteId: string,
  key: string,
  value: unknown,
): GameState {
  const level = state.levels.find((l) => l.id === levelId);
  if (!level) return state;
  return updateLevel(state, levelId, {
    sprites: level.sprites.map((s) =>
      s.id === spriteId ? { ...s, params: { ...(s.params ?? {}), [key]: value } } : s,
    ),
  });
}

// ─── Game settings ───────────────────────────────────────────────────────────

export function updateGameSettings(
  state: GameState,
  patch: Partial<Pick<GameState, "width" | "height" | "fps" | "engine">>,
): GameState {
  return { ...state, ...patch };
}

/** Update the project-level physics block (#1009). Passing `undefined`
 *  TURNS OFF physics entirely (removes the field); passing a partial
 *  patch merges over the existing block. Defaults applied when the
 *  block doesn't exist yet: gravity 1200, friction 0.1 — a 2D-platformer
 *  starter feel. */
export function updateGamePhysics(
  state: GameState,
  patch: import("@shared/game-state").GamePhysicsSettings | undefined,
): GameState {
  if (patch === undefined) {
    const { physics: _physics, ...rest } = state;
    return rest;
  }
  return {
    ...state,
    physics: {
      gravity: 1200,
      friction: 0.1,
      ...(state.physics ?? {}),
      ...patch,
    },
  };
}

/** Update a sprite's per-sprite physics opt-in (#1009). Passing
 *  `undefined` removes the field; passing a body kind sets it. */
export function updateSpritePhysics(
  state: GameState,
  levelId: string,
  spriteId: string,
  physics: import("@shared/game-state").GameSpritePhysics | undefined,
): GameState {
  const level = state.levels.find((l) => l.id === levelId);
  if (!level) return state;
  return updateLevel(state, levelId, {
    sprites: level.sprites.map((s) => {
      if (s.id !== spriteId) return s;
      if (physics === undefined) {
        const { physics: _drop, ...rest } = s;
        return rest;
      }
      return { ...s, physics };
    }),
  });
}

// ─── Block-script + animation mutations ──────────────────────────────────

let ruleCounter = 0;
function nextRuleId(): string {
  // Caller-stable monotonic id; combined with a Math.random suffix so
  // serial calls in the same module-load + a fresh project don't
  // collide on `rule-1`.
  ruleCounter += 1;
  return `rule-${ruleCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addRule(
  state: GameState,
  levelId: string,
  spriteId: string,
  trigger: BlockTrigger,
): GameState {
  const id = nextRuleId();
  const rule: BlockRule = { id, trigger, actions: [] };
  const level = state.levels.find((l) => l.id === levelId);
  if (!level) return state;
  return updateLevel(state, levelId, {
    sprites: level.sprites.map((s) =>
      s.id === spriteId ? { ...s, scripts: [...(s.scripts ?? []), rule] } : s,
    ),
  });
}

export function deleteRule(
  state: GameState,
  levelId: string,
  spriteId: string,
  ruleId: string,
): GameState {
  const level = state.levels.find((l) => l.id === levelId);
  if (!level) return state;
  return updateLevel(state, levelId, {
    sprites: level.sprites.map((s) =>
      s.id === spriteId
        ? { ...s, scripts: (s.scripts ?? []).filter((r) => r.id !== ruleId) }
        : s,
    ),
  });
}

export function updateRuleTrigger(
  state: GameState,
  levelId: string,
  spriteId: string,
  ruleId: string,
  trigger: BlockTrigger,
): GameState {
  const level = state.levels.find((l) => l.id === levelId);
  if (!level) return state;
  return updateLevel(state, levelId, {
    sprites: level.sprites.map((s) =>
      s.id === spriteId
        ? {
            ...s,
            scripts: (s.scripts ?? []).map((r) =>
              r.id === ruleId ? { ...r, trigger } : r,
            ),
          }
        : s,
    ),
  });
}

export function addAction(
  state: GameState,
  levelId: string,
  spriteId: string,
  ruleId: string,
  action: BlockAction,
): GameState {
  return mutateRule(state, levelId, spriteId, ruleId, (rule) => ({
    ...rule,
    actions: [...rule.actions, action],
  }));
}

export function updateAction(
  state: GameState,
  levelId: string,
  spriteId: string,
  ruleId: string,
  actionIndex: number,
  action: BlockAction,
): GameState {
  return mutateRule(state, levelId, spriteId, ruleId, (rule) => ({
    ...rule,
    actions: rule.actions.map((a, i) => (i === actionIndex ? action : a)),
  }));
}

export function deleteAction(
  state: GameState,
  levelId: string,
  spriteId: string,
  ruleId: string,
  actionIndex: number,
): GameState {
  return mutateRule(state, levelId, spriteId, ruleId, (rule) => ({
    ...rule,
    actions: rule.actions.filter((_, i) => i !== actionIndex),
  }));
}

function mutateRule(
  state: GameState,
  levelId: string,
  spriteId: string,
  ruleId: string,
  patch: (rule: BlockRule) => BlockRule,
): GameState {
  const level = state.levels.find((l) => l.id === levelId);
  if (!level) return state;
  return updateLevel(state, levelId, {
    sprites: level.sprites.map((s) =>
      s.id === spriteId
        ? {
            ...s,
            scripts: (s.scripts ?? []).map((r) =>
              r.id === ruleId ? patch(r) : r,
            ),
          }
        : s,
    ),
  });
}

export function updateSpriteAnimation(
  state: GameState,
  levelId: string,
  spriteId: string,
  onMount: AnimationSpec | null,
): GameState {
  return updateSprite(state, levelId, spriteId, { onMount });
}

export function reorderLevels(
  state: GameState,
  orderedIds: string[],
): GameState {
  // Filter out ids that don't exist (caller might have passed a stale
  // list after a delete) + append any current levels missing from the
  // ordering so we never lose a level on a malformed reorder.
  const known = new Map(state.levels.map((l) => [l.id, l]));
  const reordered: GameLevel[] = [];
  for (const id of orderedIds) {
    const lvl = known.get(id);
    if (lvl) {
      reordered.push(lvl);
      known.delete(id);
    }
  }
  return { ...state, levels: [...reordered, ...known.values()] };
}

export function addCustomSpriteAsset(
  state: GameState,
  asset: { id: string; url: string; width?: number; height?: number },
): GameState {
  // Idempotent — re-adding the same id replaces the URL (so a user
  // re-uploading "my-character" updates rather than duplicates).
  const existing = state.assets.find((a) => a.id === asset.id);
  const next = existing
    ? state.assets.map((a) =>
        a.id === asset.id ? { id: asset.id, kind: "sprite" as const, url: asset.url } : a,
      )
    : [...state.assets, { id: asset.id, kind: "sprite" as const, url: asset.url }];
  return { ...state, assets: next };
}

// ─── Built-in sprite assignment ──────────────────────────────────────────

/** Assign a built-in sprite to a `GameSprite`. Copies the built-in
 *  spec into `state.assets` (idempotent — a duplicate built-in id
 *  reuses the existing entry) and updates the target sprite's
 *  `assetId` + `width` / `height` to the built-in's recommended size.
 *
 *  Per PRD §1.2 the runtime is asset-source-agnostic: it resolves
 *  every sprite's image via `state.assets`. Built-ins ride the same
 *  pipeline as user-uploaded R2 assets, so the runtime + the exported
 *  HTML5 bundle don't need a "built-in library" code path. */
export function assignSpriteAsset(
  state: GameState,
  levelId: string,
  spriteId: string,
  builtin: BuiltinSprite,
): GameState {
  const asset = spriteToAsset(builtin);
  const assetsHasIt = state.assets.some((a) => a.id === asset.id);
  const nextAssets = assetsHasIt ? state.assets : [...state.assets, asset];
  const withAsset: GameState = { ...state, assets: nextAssets };
  return updateSprite(withAsset, levelId, spriteId, {
    assetId: builtin.id,
    width: builtin.width,
    height: builtin.height,
  });
}

// ─── Behavior registry ───────────────────────────────────────────────────────
//
// Per-behavior param defaults — the sprite inspector renders a form
// from this record so adding a new behavior is one entry that lights
// up the editor automatically. The runtime in `runtime-core.js` reads
// `sprite.source.params?.<key> ?? <runtime default>` so the editor
// defaults here can differ from the runtime defaults (the editor
// presents the user-friendly starting point; the runtime is the
// safety net for missing values).

export interface BehaviorParamSpec {
  key: string;
  label: string;
  /** Form-input kind. `number` renders a numeric input with min/max;
   *  `boolean` renders a checkbox; `text` renders a text input. */
  kind: "number" | "boolean" | "text";
  default: number | boolean | string;
  hint?: string;
}

export const BEHAVIORS = [
  "platformer-player",
  "scroll-left",
  "static",
  "quiz-answer",
  "memory-card",
] as const;
export type Behavior = (typeof BEHAVIORS)[number];

export const BEHAVIOR_LABELS: Record<Behavior, string> = {
  "platformer-player": "Player (platformer)",
  "scroll-left":       "Scroll left (looping)",
  "static":            "Static",
  "quiz-answer":       "Quiz answer",
  "memory-card":       "Memory card",
};

export const BEHAVIOR_PARAM_DEFAULTS: Record<Behavior, BehaviorParamSpec[]> = {
  "platformer-player": [
    { key: "runSpeed",  label: "Run speed (px/s)", kind: "number", default: 200, hint: "Horizontal velocity when arrow keys are held." },
    { key: "jumpPower", label: "Jump power",       kind: "number", default: 500, hint: "Upward impulse on jump." },
  ],
  "scroll-left": [
    { key: "speed", label: "Speed (px/s)", kind: "number", default: 200, hint: "Sprite wraps to the right edge when it scrolls past 0." },
  ],
  "static": [],
  "quiz-answer": [
    { key: "text",    label: "Answer text", kind: "text",    default: "" },
    { key: "correct", label: "Correct?",    kind: "boolean", default: false, hint: "Green flash on click when true; red when false." },
  ],
  "memory-card": [
    { key: "pairId", label: "Pair id", kind: "number", default: 0, hint: "Cards with matching pairId form a pair when both are flipped." },
  ],
};

// ─── Internal helpers ────────────────────────────────────────────────────────

function nextLevelId(state: GameState): string {
  // Stable + collision-free: scan the highest existing `level-<n>` index
  // and bump it. Survives deletes (won't reuse a freed id) which keeps
  // history-style undo / redo references stable.
  let max = 0;
  for (const l of state.levels) {
    const m = /^level-(\d+)$/.exec(l.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `level-${max + 1}`;
}

function nextSpriteId(level: GameLevel, behavior: GameSprite["behavior"]): string {
  // Prefix the id with the behavior name when present so the canvas
  // labels read meaningfully ("player-1" / "obstacle-2"). Defaults to
  // "sprite-<n>" for unbehaved sprites.
  const prefix = behavior ?? "sprite";
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const s of level.sprites) {
    const m = re.exec(s.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${max + 1}`;
}

function emptySprite(
  state: GameState,
  id: string,
  opts: { behavior?: GameSprite["behavior"]; x?: number; y?: number; width?: number; height?: number; assetId?: string },
): GameSprite {
  // Default placement: roughly canvas-center so a freshly added sprite
  // is immediately visible without scrolling. Width / height default to
  // 64×64 (chunky enough to read at typical zoom). The runtime
  // tolerates any value here.
  const width = opts.width ?? 64;
  const height = opts.height ?? 64;
  return {
    id,
    assetId: opts.assetId ?? "placeholder:sprite",
    x: opts.x ?? Math.max(0, Math.round(state.width / 2 - width / 2)),
    y: opts.y ?? Math.max(0, Math.round(state.height / 2 - height / 2)),
    width,
    height,
    behavior: opts.behavior ?? null,
    params: {},
  };
}
