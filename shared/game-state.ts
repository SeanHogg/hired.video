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

/** Which runtime executes this state.
 *
 *  - `canvas-2d` — hand-rolled Canvas-2D draw loop (#1009 physics).
 *    Reads `levels` + `sprites`. Backs the "mini-game" 2D templates
 *    (endless runner, quiz, memory match). The `phaser-3` slot is kept
 *    for backwards compatibility (existing rows seeded the field with
 *    that string before #1014); the 2D runtime treats both identically.
 *    `matter-js` reserved for the future physics-engine swap.
 *  - `world-3d` — Three.js + react-three-fiber + Rapier 3D runtime
 *    (gap #1633). Reads `world` (a `World3DState` scene graph) instead
 *    of `levels` / `sprites`. The 3D `<GameStage3D>` mounts on this
 *    discriminator; legacy 2D `<GameStage>` mounts on all other values.
 */
export type GameEngineId =
  | "canvas-2d"
  | "phaser-3"
  | "matter-js"
  | "world-3d";

export interface GameState {
  schemaVersion: number;
  /** Which runtime executes this state. See `GameEngineId` docs. */
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
  /** Project-level physics settings (#1009). Optional — when omitted
   *  the runtime treats every sprite as kinematic (no gravity, no
   *  collision response, behavior scripts move sprites directly).
   *  Setting `physics: { gravity: 1200 }` turns on the gravity solver
   *  for sprites that opt in via `GameSprite.physics.kind = "dynamic"`. */
  physics?: GamePhysicsSettings;
  /** 3D scene graph (gap #1633). Present when `engine === "world-3d"`;
   *  ignored by the 2D runtime. `levels` / `sprites` stay empty for
   *  3D projects but the surrounding shape (schemaVersion / assets /
   *  startLevelId) is shared so persistence + save chrome don't fork
   *  per engine. The 3D runtime is the SSoT for what `world` means. */
  world?: World3DState;
}

// ─── 3D world ───────────────────────────────────────────────────────────────
//
// The 3D scene graph for `engine === "world-3d"` projects (gap #1633).
// Holds everything the Three.js + Rapier runtime needs to render +
// simulate a Roblox-style world: ground, sky, lighting, the spawn
// transform, an entity list (blocks / ramps / collectibles / goals /
// hazards), and a `challenges` meta the engagement layer ties into
// (Phase 2 of the 3D build — the field is reserved so the schema
// doesn't churn when challenge handlers land).
//
// Authoring (the editor's left-rail block palette + drag/place +
// inspector) and runtime (the play-mode renderer + physics + camera
// + character controller) BOTH read this single shape. Same DRY
// commitment the 2D runtime makes with `GameLevel`.

/** Schema version of the 3D world shape — separate from the parent
 *  `GAME_STATE_SCHEMA_VERSION` so 3D migrations don't force a global
 *  rev. Bump on any breaking field change. */
export const WORLD_3D_SCHEMA_VERSION = 1;

export interface World3DState {
  schemaVersion: number;
  /** Sky / clear color. Used by the R3F `<Canvas>` background +
   *  ambient fog fallback when fog is disabled. */
  skyColor: string;
  /** Single flat ground plane. Heightmap terrain is a follow-on
   *  (tracked in the gap register under the 3D build phases). */
  ground: World3DGround;
  /** One ambient + one directional ("sun") light. Multi-light setups
   *  are a follow-on; this covers the Roblox-baseline lighting that
   *  every starter world needs. */
  lighting: World3DLighting;
  /** Where new players appear on `play` mode entry. Editor exposes a
   *  green spawn gizmo at this position; the runtime spawns the
   *  controlled character body here. */
  spawn: World3DTransform;
  /** Authored entities — blocks, ramps, props, collectibles, goals,
   *  hazards. Order is paint-order for the editor's left-rail list
   *  (no z-fighting concern in 3D; the renderer sorts by camera
   *  distance). */
  entities: World3DEntity[];
  /** Challenge meta — the engagement layer. The field is reserved
   *  (schema-stable) so Phase 2 challenge handlers can light up
   *  without a state migration. Empty list = no challenges defined.
   *  Each entry's `kind` declares its semantics ("collect N",
   *  "reach zone", "time trial", "score X"); the runtime event bus
   *  ties entity interactions to challenge progress in Phase 2. */
  challenges: World3DChallenge[];
}

export interface World3DGround {
  /** Square plane edge length in world units (meters). Default 100m
   *  — enough room for a starter world without making collectibles
   *  feel like specks. */
  size: number;
  /** Plane color (CSS hex). The runtime renders the ground as a
   *  flat-shaded material; a grass texture is an asset upgrade. */
  color: string;
}

export interface World3DLighting {
  ambient: {
    /** Hemisphere ambient strength. 0.4 is a comfortable baseline
     *  that keeps shadow sides legible without flattening. */
    intensity: number;
    color: string;
  };
  sun: {
    /** Directional light strength. 1.0 reads as "midday sun"; drop
     *  to 0.5 for golden-hour, raise to 1.5 for harsh noon. */
    intensity: number;
    /** Normalized direction the light shines TOWARD (i.e. -[sunPos]).
     *  Default `[1, -1, 0.5]` gives slanted afternoon shadows. */
    direction: [number, number, number];
    color: string;
  };
}

/** Position + Euler rotation (radians, XYZ order) + non-uniform scale.
 *  Single transform shape used by spawn + every entity — no per-kind
 *  fork (DRY rule). */
export interface World3DTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

/** Authored entity kinds. Each kind picks the right Three.js mesh +
 *  Rapier collider in the runtime:
 *   - `block`        — axis-aligned cube. Static by default. Walls,
 *                      floors, platforms.
 *   - `ramp`         — right-triangular prism. Static by default.
 *                      Walkable slopes.
 *   - `sphere`       — ball. Dynamic by default (rolls). Decorative
 *                      or kickable.
 *   - `platform`     — thin block; same as block but thinner, kept
 *                      as its own kind so the inspector can default
 *                      scale to `[4, 0.5, 4]`.
 *   - `collectible`  — pickup. Triggers a `collect` event on player
 *                      overlap; Phase 2 challenges count these.
 *   - `goal`         — finish-zone trigger. Fires a `reach` event on
 *                      player overlap.
 *   - `hazard`       — damage trigger. Fires a `harm` event.
 *   - `light`        — point light. Visual only; no collider. */
export type World3DEntityKind =
  | "block"
  | "ramp"
  | "sphere"
  | "platform"
  | "collectible"
  | "goal"
  | "hazard"
  | "light";

/** Rapier body kind:
 *   - `static`    — immovable, infinite mass. Walls, floors.
 *   - `dynamic`   — full physics. Falls with gravity, collides.
 *   - `kinematic` — moved by scripts, not by physics. Moving
 *                    platforms in later phases.
 *   - `none`      — no collider at all. Decorative or pure light. */
export type World3DPhysicsKind =
  | "static"
  | "dynamic"
  | "kinematic"
  | "none";

export interface World3DEntity extends World3DTransform {
  id: string;
  kind: World3DEntityKind;
  /** Display color (CSS hex). The runtime maps this to a flat
   *  material; textured material is a follow-on. */
  color: string;
  /** Physics body kind — defaults are kind-specific (see seed
   *  helpers) but every entity can override. */
  physics: World3DPhysicsKind;
  /** Optional tag for Phase 2 challenge wiring. Free-form string —
   *  challenges reference these to count "collect items tagged
   *  X" / "reach zone tagged Y". */
  tag?: string;
}

/** Challenge meta. Phase 2 ties these to runtime events. The shape
 *  is forward-declared so the schema doesn't churn between phases. */
export interface World3DChallenge {
  id: string;
  /** Human label shown in the engagement HUD. */
  label: string;
  kind: World3DChallengeKind;
  /** Per-kind params. Kept open-shape (Record) so adding a new
   *  challenge kind doesn't break older readers — Phase 2 lands a
   *  zod-checked discriminated union when the handlers are wired. */
  params: Record<string, unknown>;
}

export type World3DChallengeKind =
  | "collect"
  | "reach"
  | "score"
  | "timer";

/** Project-level physics knobs. Single source — every runtime tick
 *  reads from here. Default values match a "2D platformer" feel: 1200
 *  px/s² gravity (~120 px/frame at 60fps), 0.1 friction. */
export interface GamePhysicsSettings {
  /** Downward acceleration in pixels-per-second-squared. Positive
   *  pulls sprites toward the bottom of the canvas. 0 = no gravity
   *  (top-down games). */
  gravity: number;
  /** Surface friction coefficient applied to dynamic sprites resting
   *  on a static / kinematic surface. 0..1; 0 = ice, 1 = velcro. */
  friction: number;
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
  /** Per-sprite physics opt-in (#1009). When omitted the sprite is
   *  treated as kinematic (the runtime moves it directly per
   *  behavior / script — same as today). Setting `kind: "dynamic"`
   *  turns on gravity + collision response for this sprite; `static`
   *  marks it as an immovable platform that dynamic sprites collide
   *  against. */
  physics?: GameSpritePhysics;
}

/** Per-sprite physics opt-in. Three body kinds matching the Matter.js
 *  / Box2D vocabulary (the project picks one of those engines in #1009
 *  follow-on; the spec stays the same): */
export interface GameSpritePhysics {
  /** Body kind:
   *   - `static`    — immovable, infinite mass (platforms, walls,
   *                    ceilings). Dynamic bodies collide against
   *                    static bodies; static bodies never move.
   *   - `kinematic` — moved by behavior / scripts, NOT by physics.
   *                    Dynamic bodies collide against kinematic
   *                    bodies (e.g. a moving elevator). The default
   *                    when `physics` is omitted entirely.
   *   - `dynamic`   — affected by gravity + collisions. The player
   *                    sprite + falling crates are dynamic. */
  kind: "static" | "kinematic" | "dynamic";
  /** Mass for collision response. Defaults to 1 — sprites of equal
   *  mass push each other equally. A 10× mass crate pushes a 1× mass
   *  sprite ~10× harder. */
  mass?: number;
  /** Bounciness — 0..1. 0 = absorbs all collision energy (a sandbag),
   *  1 = perfectly elastic (a rubber ball). Default 0. */
  restitution?: number;
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
    // Honest current value (#1014) — the runtime is canvas-2D today.
    // Phaser-3 swap is a future renderer choice tracked separately.
    engine: "canvas-2d",
    width: opts.width ?? 1280,
    height: opts.height ?? 720,
    fps: opts.fps ?? 60,
    startLevelId: startId,
    levels: [defaultLevel(startId, "Level 1")],
    assets: [],
    // Physics turned OFF by default (#1009) — existing projects
    // continue to work with hand-rolled behaviors. Authors opt in by
    // setting `physics: { gravity, friction }` here + flagging
    // individual sprites with `physics.kind: "static" | "dynamic"`.
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
 *  + the future Phaser runtime + the export pipeline all read this.
 *  For 3D worlds (engine === "world-3d") the check pivots: a 3D world
 *  is playable when `world` is populated (the 3D runtime doesn't use
 *  `levels` / `startLevelId`). */
export function isPlayable(state: GameState): boolean {
  if (state.engine === "world-3d") {
    return state.world != null;
  }
  if (state.levels.length === 0) return false;
  return state.levels.some((l) => l.id === state.startLevelId);
}

/** Build an empty 3D world state — flat green ground, midday sun,
 *  spawn at origin, no entities, no challenges. Used by the
 *  `game_3d_world` template seed + the editor's "+ New world" path.
 *  Single source so seed / mutation / migration consumers don't drift. */
export function emptyWorld3DState(): World3DState {
  return {
    schemaVersion: WORLD_3D_SCHEMA_VERSION,
    skyColor: "#7dd3fc",
    ground: { size: 100, color: "#65a30d" },
    lighting: {
      ambient: { intensity: 0.45, color: "#ffffff" },
      sun: {
        intensity: 1.0,
        direction: [1, -1, 0.5],
        color: "#ffffff",
      },
    },
    spawn: {
      position: [0, 2, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    entities: [],
    challenges: [],
  };
}

/** Build a 3D-engine `GameState` with a populated `world` field.
 *  Mirrors `emptyGameState()` but for the world-3d path; the 2D
 *  `levels` array is left empty since the 3D runtime ignores it. */
export function empty3DGameState(opts: {
  width?: number;
  height?: number;
  fps?: number;
} = {}): GameState {
  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    engine: "world-3d",
    width: opts.width ?? 1280,
    height: opts.height ?? 720,
    fps: opts.fps ?? 60,
    startLevelId: "",
    levels: [],
    assets: [],
    world: emptyWorld3DState(),
  };
}

// NOTE: `findStartLevel` used to live here, but every consumer is
// runtime-side (the editor's <GameStage>, the in-app runtime, and the
// IIFE-bundled exported runtime). To keep the dispatch logic single-source
// across the in-app + exported paths, it now lives in
// `frontend/lib/studio/game/runtime-core.js`. Import from there (or via
// the TS shim at `frontend/lib/studio/game/runtime.ts`).
