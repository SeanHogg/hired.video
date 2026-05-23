/**
 * Game state spec — the canonical JSON shape for `mediaKind: "game"`
 * studio projects. Parallel to `shared/timeline.ts` (which is the
 * Timeline runtime's state) — this is the Game runtime's state.
 *
 * Per the canvas-runtime extensibility model in
 * `docs/prd/studio-media-kinds.md` §1.2, every canvas kind owns its
 * own state model. Game projects persist this shape on
 * `studio_projects.game_state` (jsonb, migration 0101); the editor's
 * `<CanvasRouter mediaKind/>` mounts `<GameStage>` when the project is
 * game-kind and the stage reads / writes this shape.
 *
 * SCENE SHAPE — game uses scenes as STATE-GRAPH NODES (levels, menu
 * screens, end screens), not as time slices the way Timeline kinds do.
 * The shared editor shell still surfaces "scenes" in its left rail, but
 * the semantics are runtime-specific.
 *
 * ENGINE — `engine` is the runtime that executes the game state at
 * playtest + export time. Today only `phaser-3` is planned (lightweight
 * 2D, MIT, mature); future entries can add `three-js` (3D), `p5-js`
 * (creative coding), etc. The state shape stays the same; the renderer
 * differs.
 *
 * Versioning: `schemaVersion` is bumped on any breaking change.
 * Migrations live in `frontend/lib/studio/game/migrations.ts` (added
 * when needed). Don't delete or rename existing fields — add new ones
 * with defaults and migrate readers.
 */

export const GAME_STATE_SCHEMA_VERSION = 1;

export type GameEngineId = "phaser-3";

export interface GameState {
  schemaVersion: number;
  /** Which runtime executes this state. Phaser 3 is the only option
   *  today; the field is here so future runtimes (three-js / p5-js)
   *  can plug in without a state-shape migration. */
  engine: GameEngineId;
  /** Output viewport dimensions. The runtime scales / letterboxes
   *  the rendered canvas to fit; this is the design-time reference. */
  width: number;
  height: number;
  /** Frame rate the game state machine targets. Most casual games
   *  ship at 60 FPS; pixel-art / retro genres often target 30. */
  fps: number;
  /** Levels / state-graph nodes. Order matters for the default
   *  next-level chain when a level doesn't declare its own
   *  `nextLevelId`. */
  levels: GameLevel[];
  /** Which level the runtime mounts first. Must match a level.id. */
  startLevelId: string;
  /** Asset library bound to this project — sprites, sounds, fonts.
   *  Sources live in R2 (resolved via the existing MediaPicker flow);
   *  this array is the manifest the runtime preloads at boot. */
  assets: GameAsset[];
}

/** A single state-graph node — a level, a menu screen, a cutscene. */
export interface GameLevel {
  id: string;
  label: string;
  /** Backdrop fill when no background sprite covers the viewport. */
  backgroundColor: string;
  /** Sprite instances placed in this level. The runtime spawns each
   *  on level mount; behavior scripts drive ongoing motion / state. */
  sprites: GameSprite[];
  /** Where this level transitions on a "win" event (defaults to the
   *  next level in `levels[]`; set explicitly to override). */
  nextLevelId?: string;
  /** Where this level transitions on a "lose" event (defaults to
   *  restarting the same level). */
  failLevelId?: string;
}

/** A placed sprite instance in a level. */
export interface GameSprite {
  id: string;
  /** Asset id (matches `GameAsset.id`); the runtime looks up the URL +
   *  frame data via the asset manifest. */
  assetId: string;
  /** Top-left position in design-time pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Behavior script id — registered handler that drives the sprite's
   *  per-frame logic (e.g. "platformer-player", "static",
   *  "patrol-horizontal", "spawner"). `null` = no behavior, the
   *  sprite is decorative. The 5 baked behaviors are FAST PATHS for
   *  common patterns; `scripts` (below) is the general-purpose visual
   *  scripting that runs ALONGSIDE the behavior. */
  behavior: string | null;
  /** Optional per-sprite key-value params the behavior reads (e.g.
   *  `{ speed: 200 }` for a patroller, `{ jumpPower: 600 }` for a
   *  platformer player). Behaviors document their own param shape. */
  params?: Record<string, unknown>;
  /** Visual block scripts — Snap! / Scratch-style rules built in the
   *  block editor. Each rule is `{ trigger, actions }`: when the
   *  trigger fires (key press, click, level mount, every N seconds),
   *  the actions run in order (move-by, set-property, goto-level,
   *  add-score, wait, etc.). Empty / undefined = no block scripts;
   *  the sprite uses its `behavior` alone (or is decorative if both
   *  are absent). The same runtime interprets both kinds. */
  scripts?: BlockRule[];
  /** Mount-time animation — fade in / slide in / scale up with a
   *  duration + easing. Reuses the Video editor's motion-preset
   *  vocabulary so a polish pass on Timeline animations ripples into
   *  games for free. `null` / undefined = sprite appears in place. */
  onMount?: AnimationSpec | null;
}

// ─── Visual scripting (block coding) ─────────────────────────────────────
//
// The block scripting model is intentionally a flat, structured shape
// — not a free-form AST — so the editor's block UI is a forms-driven
// trigger + actions list (one dropdown per slot) rather than a
// pannable canvas of draggable blocks. This trades expressive power
// for build-time + a clear interpretation contract: the runtime in
// `frontend/lib/studio/game/runtime-core.js` walks the rules once per
// trigger event and executes the actions sequentially. Designed so a
// future migration to scratch-blocks / blockly compiles its block
// tree DOWN to this shape without touching the runtime.

export interface BlockRule {
  /** Stable id so the editor can update a rule in place without
   *  re-keying the React list. */
  id: string;
  trigger: BlockTrigger;
  /** Actions run sequentially. `wait-seconds` yields the rule and
   *  resumes on the next tick after the duration has elapsed. */
  actions: BlockAction[];
}

export type BlockTrigger =
  | { kind: "on-level-mount" }
  | { kind: "on-tick" }
  | { kind: "on-key-press"; key: string }
  | { kind: "on-click" }
  | { kind: "on-collide-with"; spriteId: string }
  | { kind: "every-seconds"; interval: number };

export type BlockAction =
  | { kind: "move-by"; dx: number; dy: number }
  | { kind: "set-position"; x: number; y: number }
  | { kind: "set-property"; property: "width" | "height"; value: number }
  | { kind: "show" }
  | { kind: "hide" }
  | { kind: "goto-level"; levelId: string }
  | { kind: "play-sound"; assetId: string }
  | { kind: "wait-seconds"; seconds: number }
  | { kind: "set-message"; text: string };

// ─── Animation ──────────────────────────────────────────────────────────

/** Mount-time / transition animation spec — the runtime interprets
 *  `kind` to drive an alpha / offset / scale multiplier over
 *  `durationMs` using the named easing. Designed to compose with
 *  Phaser's tween library when the engine swap (#939) lands —
 *  same spec, different interpreter. */
export interface AnimationSpec {
  kind: "fade-in" | "slide-in-left" | "slide-in-right" | "slide-in-up" | "slide-in-down" | "scale-up" | "none";
  durationMs: number;
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

/** An asset the runtime preloads at boot. */
export interface GameAsset {
  id: string;
  kind: "sprite" | "spritesheet" | "audio" | "tilemap";
  url: string;
  /** Optional frame dimensions for spritesheet assets — runtime
   *  slices the source image into a frame grid. */
  frameWidth?: number;
  frameHeight?: number;
}

// ---------------------------------------------------------------------------
// Constructors — single source of truth so the chooser, the editor's
// "+ Add level", and the game-seed-from-template path all produce
// identical defaults.
// ---------------------------------------------------------------------------

/** Build an empty game state with a single starter level. */
export function emptyGameState(opts: {
  width?: number;
  height?: number;
  fps?: number;
} = {}): GameState {
  const startId = "level-1";
  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    engine: "phaser-3",
    width: opts.width ?? 1280,
    height: opts.height ?? 720,
    fps: opts.fps ?? 60,
    startLevelId: startId,
    levels: [defaultLevel(startId, "Level 1")],
    assets: [],
  };
}

/** Build a level with sensible defaults. Used by `emptyGameState` and
 *  the editor's "+ Add level" action so every new level starts the same. */
export function defaultLevel(id: string, label: string): GameLevel {
  return {
    id,
    label,
    backgroundColor: "#1e293b",
    sprites: [],
  };
}

/** True when the game state has at least one level and that level
 *  declares a startLevelId that resolves. The `<GameStage>` placeholder
 *  + the future Phaser runtime + the export pipeline all read this. */
export function isPlayable(state: GameState): boolean {
  if (state.levels.length === 0) return false;
  return state.levels.some((l) => l.id === state.startLevelId);
}

// NOTE: `findStartLevel` used to live here, but every consumer is
// runtime-side (the editor's <GameStage>, the in-app runtime, and the
// IIFE-bundled exported runtime). To keep the dispatch logic single-source
// across the in-app + exported paths, it now lives in
// `frontend/lib/studio/game/runtime-core.js`. Import from there (or via
// the TS shim at `frontend/lib/studio/game/runtime.ts`).
