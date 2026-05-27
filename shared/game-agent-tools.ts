/**
 * Game-agent tools — the SSoT registry of tool-call functions the
 * Phase-5 AI game-builder agent (gap #1638) can invoke. Every tool
 * corresponds 1:1 with a mutation in
 * `frontend/lib/studio/game/world-3d-edit.ts` so the agent's universe
 * of authoring actions matches what the human editor can do (no
 * special "agent only" mutations; no human-only mutations the agent
 * can't reach).
 *
 * Shared between:
 *   - `api/src/routes/game-agent.ts` (sends tools to the LLM, applies
 *     returned tool-calls server-side, persists)
 *   - `frontend/components/studio/game/world-3d/AIAgentPanel.tsx`
 *     (renders per-tool icons + "applied" affordance labels)
 *
 * Each entry is a Zod-validated input shape PLUS the OpenAI-style
 * JSON-schema export the LLM gateway expects. The Zod schema is the
 * source; the JSON-schema is derived at module load via `toJSONSchema`
 * (see `api/src/routes/game-agent.ts`).
 */

import { z } from "zod";

// ─── Primitive types ──────────────────────────────────────────────────

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
const EntityKind = z.enum([
  "block",
  "platform",
  "ramp",
  "sphere",
  "collectible",
  "goal",
  "hazard",
  "light",
]);
const PhysicsKind = z.enum(["static", "dynamic", "kinematic", "sensor", "none"]);
const ChallengeKind = z.enum(["collect", "reach", "score", "timer"]);

// ─── Tool schemas ─────────────────────────────────────────────────────

export const placeEntitySchema = z.object({
  kind: EntityKind.describe("Which entity to place. Blocks/platforms/ramps are solid; collectible/goal/hazard are triggers."),
  position: Vec3.describe("World position [x, y, z] in meters. y=0 is the ground plane; entities sit on top so y should be at least half the entity's height."),
  rotation: Vec3.optional().describe("Euler XYZ rotation in radians. Default [0,0,0]."),
  scale: Vec3.optional().describe("Per-axis scale. Default is kind-specific (e.g. block defaults to [2,2,2])."),
  color: z.string().optional().describe("CSS hex color like #facc15. Defaults to a kind-specific color."),
  tag: z.string().optional().describe("Free-form tag for challenge wiring. Examples: 'coin', 'level-goal', 'lava'."),
});

export const updateEntitySchema = z.object({
  entityId: z.string().describe("The id of an existing entity to mutate."),
  position: Vec3.optional(),
  rotation: Vec3.optional(),
  scale: Vec3.optional(),
  color: z.string().optional(),
  physics: PhysicsKind.optional(),
  tag: z.string().optional(),
});

export const deleteEntitySchema = z.object({
  entityId: z.string().describe("Id of the entity to remove."),
});

export const setSpawnSchema = z.object({
  position: Vec3,
  rotation: Vec3.optional(),
});

export const setGroundSchema = z.object({
  size: z.number().min(10).max(500).optional().describe("Edge length of the square ground plane in meters."),
  color: z.string().optional().describe("CSS hex color for the ground."),
});

export const setLightingSchema = z.object({
  ambientIntensity: z.number().min(0).max(2).optional(),
  ambientColor: z.string().optional(),
  sunIntensity: z.number().min(0).max(3).optional(),
  sunColor: z.string().optional(),
  sunDirection: Vec3.optional(),
});

export const setSkyColorSchema = z.object({
  color: z.string().describe("CSS hex sky / background color."),
});

export const addChallengeSchema = z.object({
  kind: ChallengeKind,
  label: z.string().min(1).max(80),
  // Permissive — per-kind validation happens inside `world-3d-edit.ts`'s
  // `deriveTarget`. The schema here is a free-form record so adding
  // a challenge kind in Phase 2b doesn't require touching the agent.
  params: z.record(z.string(), z.unknown()).optional(),
});

export const deleteChallengeSchema = z.object({
  challengeId: z.string(),
});

// ─── Tool registry (SSoT) ─────────────────────────────────────────────

export const GAME_AGENT_TOOLS = [
  {
    name: "place_entity",
    description: "Place a new entity (block, platform, ramp, sphere, collectible, goal, hazard, or light) in the world.",
    schema: placeEntitySchema,
  },
  {
    name: "update_entity",
    description: "Modify the transform / color / physics / tag of an existing entity.",
    schema: updateEntitySchema,
  },
  {
    name: "delete_entity",
    description: "Remove an entity from the world.",
    schema: deleteEntitySchema,
  },
  {
    name: "set_spawn",
    description: "Move where the player spawns when they press Playtest.",
    schema: setSpawnSchema,
  },
  {
    name: "set_ground",
    description: "Change the ground plane size and/or color.",
    schema: setGroundSchema,
  },
  {
    name: "set_lighting",
    description: "Adjust the ambient + sun lighting parameters.",
    schema: setLightingSchema,
  },
  {
    name: "set_sky_color",
    description: "Change the sky / background color of the world.",
    schema: setSkyColorSchema,
  },
  {
    name: "add_challenge",
    description: "Add a challenge to the world (collect N, reach goal, score X, beat the clock).",
    schema: addChallengeSchema,
  },
  {
    name: "delete_challenge",
    description: "Remove a challenge from the world.",
    schema: deleteChallengeSchema,
  },
] as const;

export type GameAgentToolName = (typeof GAME_AGENT_TOOLS)[number]["name"];

/** Friendly labels for the per-tool "✓ applied" line in the UI. */
export const GAME_AGENT_TOOL_LABELS: Record<GameAgentToolName, string> = {
  place_entity: "Placed",
  update_entity: "Updated",
  delete_entity: "Deleted",
  set_spawn: "Moved spawn",
  set_ground: "Updated ground",
  set_lighting: "Adjusted lighting",
  set_sky_color: "Recolored sky",
  add_challenge: "Added challenge",
  delete_challenge: "Removed challenge",
};
