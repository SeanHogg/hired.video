/**
 * Pure immutable helpers for editing a `World3DState` (gap #1634 —
 * the 3D-engine variant of `mediaKind: "game"` studio projects).
 * Parallel to `game-state-edit.ts` for the 2D path; same DRY rule —
 * every mutation lives here so the editor UI, the agent-tool consumer
 * (Phase 5), and unit tests share one mutation surface.
 *
 * Every helper returns a NEW `GameState` (never mutates the input).
 * Helpers operate at the GameState level (not raw World3DState) so
 * the editor and the studio service can write through the same shape
 * they already persist — `world` is just an optional field on
 * GameState, the discriminator is `engine === "world-3d"`.
 *
 * KIND DEFAULTS — every entity kind picks the "this is what you
 * probably meant" defaults for scale + physics + color in
 * `ENTITY_KIND_DEFAULTS`. The block palette in `<GameStage3D>` calls
 * `addEntity(state, { kind })` with no other args; the defaults fill
 * the rest. Authors override per-entity via the inspector.
 */

import type {
  GameState,
  World3DChallenge,
  World3DChallengeKind,
  World3DEntity,
  World3DEntityKind,
  World3DPhysicsKind,
  World3DState,
  World3DTransform,
} from "./game-state.js";
import { emptyWorld3DState } from "./game-state.js";

// ─── Entity kind defaults ─────────────────────────────────────────────────

interface EntityKindDefaults {
  scale: [number, number, number];
  color: string;
  physics: World3DPhysicsKind;
}

/** Single source of truth for "what does a fresh <kind> look like".
 *  Block palette, the agent-tool consumer (Phase 5), and the inspector's
 *  "reset to default" affordance all read this — no per-call-site
 *  hand-rolling. */
export const ENTITY_KIND_DEFAULTS: Record<World3DEntityKind, EntityKindDefaults> = {
  block:       { scale: [2, 2, 2],   color: "#94a3b8", physics: "static" },
  ramp:        { scale: [3, 1, 3],   color: "#a8a29e", physics: "static" },
  sphere:      { scale: [1, 1, 1],   color: "#fbbf24", physics: "dynamic" },
  // Thin block — same renderer as `block`, distinct entry so the
  // inspector defaults to a "platform feel" (4×0.5×4) without the
  // author having to retype the scale.
  platform:    { scale: [4, 0.5, 4], color: "#a3a3a3", physics: "static" },
  // Sensor entities — Rapier intersection events fire from these into
  // the Phase-2 challenge runtime. No physical pushback; the player
  // passes through and the runtime emits `collect` / `reach` / `harm`.
  collectible: { scale: [0.6, 0.6, 0.6], color: "#facc15", physics: "sensor" },
  goal:        { scale: [2, 2, 2],   color: "#22c55e", physics: "sensor" },
  hazard:      { scale: [2, 1, 2],   color: "#ef4444", physics: "sensor" },
  light:       { scale: [0.4, 0.4, 0.4], color: "#fef9c3", physics: "none" },
  // Weapon prop (gap #1659 / Roblox-feature follow-on #1661). Roblox-
  // standard "nerf gun" silhouette is a small orange L-shape; the
  // runtime renders it as a tinted box with a barrel cap for v1. No
  // collider — it's a prop, players don't bump into it (a pickup
  // mechanic arrives with the equip system in #1661).
  weapon:      { scale: [0.6, 0.4, 0.9], color: "#fb923c", physics: "none" },
};

// ─── World accessors ──────────────────────────────────────────────────────

/** Read the 3D world from a GameState. Returns null when the project
 *  isn't a 3D project (engine !== "world-3d") or `world` was never
 *  written. Editor callers null-check before calling 3D mutations. */
export function getWorld(state: GameState): World3DState | null {
  if (state.engine !== "world-3d") return null;
  return state.world ?? null;
}

/** Internal: write a new world back onto the GameState. Used by every
 *  mutation below so they share one "write the world" code path. */
function writeWorld(state: GameState, world: World3DState): GameState {
  return { ...state, world };
}

/** Ensure the GameState carries a world. Used at editor mount so legacy
 *  rows or freshly-created 3D drafts always have a populated world.
 *  Idempotent — returns the same state when `world` already exists. */
export function ensureWorld(state: GameState): GameState {
  if (state.world) return state;
  return writeWorld(state, emptyWorld3DState());
}

// ─── Entity mutations ─────────────────────────────────────────────────────

/** Add a new entity at the given position (defaults to origin). The
 *  remaining fields are pulled from `ENTITY_KIND_DEFAULTS` so callers
 *  only pass `{ kind, position? }`. Returns the new state + the new
 *  entity so the editor can select it on add. */
export function addEntity(
  state: GameState,
  opts: {
    kind: World3DEntityKind;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    color?: string;
    physics?: World3DPhysicsKind;
    tag?: string;
    textureUrl?: string;
  },
): { state: GameState; entity: World3DEntity } {
  const world = ensureWorld(state).world!;
  const defaults = ENTITY_KIND_DEFAULTS[opts.kind];
  const id = nextEntityId(world, opts.kind);
  const entity: World3DEntity = {
    id,
    kind: opts.kind,
    position: opts.position ?? [0, defaults.scale[1] / 2, 0],
    rotation: opts.rotation ?? [0, 0, 0],
    scale: opts.scale ?? defaults.scale,
    color: opts.color ?? defaults.color,
    physics: opts.physics ?? defaults.physics,
    tag: opts.tag,
    textureUrl: opts.textureUrl,
  };
  const next = writeWorld(ensureWorld(state), {
    ...world,
    entities: [...world.entities, entity],
  });
  return { state: next, entity };
}

export function updateEntity(
  state: GameState,
  entityId: string,
  patch: Partial<Omit<World3DEntity, "id">>,
): GameState {
  const world = getWorld(state);
  if (!world) return state;
  return writeWorld(state, {
    ...world,
    entities: world.entities.map((e) =>
      e.id === entityId ? { ...e, ...patch } : e,
    ),
  });
}

export function deleteEntity(state: GameState, entityId: string): GameState {
  const world = getWorld(state);
  if (!world) return state;
  return writeWorld(state, {
    ...world,
    entities: world.entities.filter((e) => e.id !== entityId),
  });
}

// ─── World-level mutations ────────────────────────────────────────────────

export function updateSpawn(
  state: GameState,
  patch: Partial<World3DTransform>,
): GameState {
  const world = getWorld(state);
  if (!world) return state;
  return writeWorld(state, { ...world, spawn: { ...world.spawn, ...patch } });
}

export function updateGround(
  state: GameState,
  patch: Partial<World3DState["ground"]>,
): GameState {
  const world = getWorld(state);
  if (!world) return state;
  return writeWorld(state, { ...world, ground: { ...world.ground, ...patch } });
}

export function updateLighting(
  state: GameState,
  patch: Partial<World3DState["lighting"]>,
): GameState {
  const world = getWorld(state);
  if (!world) return state;
  return writeWorld(state, {
    ...world,
    lighting: { ...world.lighting, ...patch },
  });
}

export function updateSkyColor(state: GameState, skyColor: string): GameState {
  const world = getWorld(state);
  if (!world) return state;
  return writeWorld(state, { ...world, skyColor });
}

// ─── Challenge mutations ──────────────────────────────────────────────────
//
// Phase 1 surfaces challenges as data only — the runtime event bus +
// HUD wiring is Phase 2 (gap #1635). The CRUD helpers ship now so the
// schema doesn't churn between phases and the agent-tool consumer
// (Phase 5) has the mutation surface ready.

export function addChallenge(
  state: GameState,
  opts: {
    kind: World3DChallengeKind;
    label: string;
    params?: Record<string, unknown>;
  },
): { state: GameState; challenge: World3DChallenge } {
  const world = ensureWorld(state).world!;
  const id = nextChallengeId(world);
  const challenge: World3DChallenge = {
    id,
    kind: opts.kind,
    label: opts.label,
    params: opts.params ?? {},
  };
  const next = writeWorld(ensureWorld(state), {
    ...world,
    challenges: [...world.challenges, challenge],
  });
  return { state: next, challenge };
}

export function deleteChallenge(state: GameState, challengeId: string): GameState {
  const world = getWorld(state);
  if (!world) return state;
  return writeWorld(state, {
    ...world,
    challenges: world.challenges.filter((c) => c.id !== challengeId),
  });
}

export function updateChallenge(
  state: GameState,
  challengeId: string,
  patch: Partial<Omit<World3DChallenge, "id">>,
): GameState {
  const world = getWorld(state);
  if (!world) return state;
  return writeWorld(state, {
    ...world,
    challenges: world.challenges.map((c) =>
      c.id === challengeId ? { ...c, ...patch } : c,
    ),
  });
}

// ─── Id helpers ───────────────────────────────────────────────────────────

function nextEntityId(world: World3DState, kind: World3DEntityKind): string {
  let max = 0;
  const re = new RegExp(`^${kind}-(\\d+)$`);
  for (const e of world.entities) {
    const m = re.exec(e.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${kind}-${max + 1}`;
}

function nextChallengeId(world: World3DState): string {
  let max = 0;
  for (const c of world.challenges) {
    const m = /^challenge-(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `challenge-${max + 1}`;
}
