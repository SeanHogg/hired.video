/**
 * Game-agent route — Phase-5 AI game-builder (gap #1638).
 *
 * Single round-trip endpoint:
 *   POST /api/studio/game-agent/:projectId/turn
 *   Body: { message: string }
 *   Response: { newGameState, toolCalls[], assistantMessage }
 *
 * Per turn the route:
 *   1. Loads project + asserts the caller can act on it (canActFor).
 *   2. Pulls the persisted conversation row, appends the new user msg.
 *   3. Calls Claude with the tool catalog from `shared/game-agent-tools.ts`.
 *   4. For each tool call returned, applies it to the GameState via the
 *      shared `world-3d-edit.ts` mutation seam (same SSoT the frontend
 *      uses — no duplicate mutation logic).
 *   5. Persists new GameState + appends assistant message + tool results
 *      to the conversation. Increments tokensSpent.
 *   6. Returns the new state so the editor can swap in.
 *
 * Multi-step "agentic" loops (tool → result → tool → result …) are
 * supported by the gateway natively in a follow-on; the Phase-5 MVP
 * runs one user turn → one assistant turn (with possibly many tool
 * calls in that single turn). The seam supports more turns without
 * route changes.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { getDb } from "../db/index.js";
import { studioProjects } from "../db/schema/resumes.js";
import { gameAgentConversations } from "../db/schema/games.js";
import { canActFor } from "../services/studio/workspace.js";
import { createLLMClient, type LLMMessage, type ToolSpec } from "../services/adapters/llm-client.js";
import {
  GAME_AGENT_TOOLS,
  type GameAgentToolName,
} from "../../../shared/game-agent-tools.js";
import {
  addChallenge,
  addEntity,
  deleteChallenge,
  deleteEntity,
  ensureWorld,
  updateEntity,
  updateGround,
  updateLighting,
  updateSkyColor,
  updateSpawn,
} from "../../../shared/world-3d-edit.js";
import type { GameState } from "../../../shared/game-state.js";
import { toJSONSchema } from "zod";

export const gameAgentRoutes = new Hono<AppEnv>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}
function fail(code: string, message: string) {
  return { success: false as const, error: { code, message }, timestamp: new Date().toISOString() };
}

const SYSTEM_PROMPT = `You are an AI assistant inside the hired.video 3D World game studio.

You help the user build a Roblox-style 3D world by calling the tools listed.
Each tool corresponds to one authoring action: placing blocks, adjusting
lighting, defining challenges, etc.

Guidelines:
- Be concrete. If the user says "make it spooky", call set_sky_color with a
  dark hex + set_lighting with low intensity + place a few hazards. Don't
  just describe what spooky would look like.
- Place entities on top of the ground: y should be at least half the entity's
  height. The ground is at y=0; a default block (scale 2,2,2) sits with its
  centre at y=1.
- Use tags ("coin", "level-goal", "lava") on collectibles / goals / hazards
  so challenges can target them.
- When the user asks for a "level", default to one challenge + a small set
  of platforms / collectibles / a goal.
- Keep your text reply short — the visible action is the world updating,
  not the prose.`;

// Compile the tool registry into the OpenAI-style ToolSpec the gateway
// expects. Done once at module load — same shape every turn.
const TOOL_SPECS: ToolSpec[] = GAME_AGENT_TOOLS.map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: toJSONSchema(tool.schema) as ToolSpec["function"]["parameters"],
  },
}));

const TURN_SCHEMA = z.object({
  message: z.string().min(1).max(2000),
});

interface PersistedMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  toolCallId?: string;
  name?: string;
}

gameAgentRoutes.post("/:projectId/turn", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);

  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid projectId"), 400);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = TURN_SCHEMA.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  // ─── Ownership + load project ───────────────────────────────────────
  const db = getDb();
  const [project] = await db
    .select({
      id: studioProjects.id,
      userId: studioProjects.userId,
      companyId: studioProjects.companyId,
      gameState: studioProjects.gameState,
    })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!project) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  const allowed = await canActFor(user.sub, project.userId, project.companyId ?? null);
  if (!allowed) return c.json(fail("NOT_FOUND", "Project not found"), 404);

  // ─── Load or create the conversation row ─────────────────────────────
  const [existing] = await db
    .select()
    .from(gameAgentConversations)
    .where(eq(gameAgentConversations.projectId, projectId))
    .limit(1);
  const history: PersistedMessage[] = Array.isArray(existing?.messages)
    ? (existing!.messages as PersistedMessage[])
    : [];

  // ─── Compose the LLM message list ────────────────────────────────────
  // Cap history to the last 20 turns so a long-running session doesn't
  // blow the model's context window. Older messages are dropped but
  // stay in the persisted row for the audit log + a future "scroll back"
  // affordance.
  const RECENT_TURNS = 20;
  const recent = history.slice(-RECENT_TURNS);
  const llmMessages: LLMMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...recent.map(persistedToLLM),
    { role: "user", content: parsed.data.message },
  ];

  // ─── Call the LLM with tool catalog ──────────────────────────────────
  const llm = createLLMClient(c.env, user);
  let result;
  try {
    result = await llm.callMessages("studio_game_agent", {
      useCase: "studio_game_agent",
      messages: llmMessages,
      tools: TOOL_SPECS,
      toolChoice: "auto",
    });
  } catch (e) {
    console.warn("[game-agent] LLM call failed", e);
    return c.json(fail("LLM_FAILED", "AI agent could not respond. Try again."), 502);
  }

  // ─── Apply tool calls server-side ────────────────────────────────────
  let nextState: GameState = ensureWorld(project.gameState as GameState);
  const appliedToolCalls: Array<{ id: string; name: string; arguments: unknown; applied: boolean; error?: string }> = [];
  for (const call of result.toolCalls) {
    const name = call.function.name as GameAgentToolName;
    let args: unknown;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      appliedToolCalls.push({ id: call.id, name, arguments: call.function.arguments, applied: false, error: "Invalid JSON arguments" });
      continue;
    }
    try {
      nextState = applyAgentTool(nextState, name, args);
      appliedToolCalls.push({ id: call.id, name, arguments: args, applied: true });
    } catch (err) {
      appliedToolCalls.push({
        id: call.id,
        name,
        arguments: args,
        applied: false,
        error: err instanceof Error ? err.message : "Tool failed",
      });
    }
  }

  // ─── Persist new gameState ───────────────────────────────────────────
  if (appliedToolCalls.some((c) => c.applied)) {
    await db
      .update(studioProjects)
      .set({ gameState: nextState })
      .where(eq(studioProjects.id, projectId));
  }

  // ─── Append messages + persist conversation ──────────────────────────
  const newMessages: PersistedMessage[] = [
    { role: "user", content: parsed.data.message },
    {
      role: "assistant",
      content: result.content,
      toolCalls:
        result.toolCalls.length > 0
          ? result.toolCalls.map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }))
          : undefined,
    },
    // Tool results — one per applied call. Bundles into the history so
    // the next turn can reference what happened.
    ...appliedToolCalls.map((tc) => ({
      role: "tool" as const,
      content: JSON.stringify({ applied: tc.applied, error: tc.error }),
      toolCallId: tc.id,
      name: tc.name,
    })),
  ];
  const fullMessages = [...history, ...newMessages];

  if (existing) {
    await db
      .update(gameAgentConversations)
      .set({
        messages: fullMessages,
        tokensSpent: existing.tokensSpent + result.usage.totalTokens,
        updatedAt: new Date(),
      })
      .where(eq(gameAgentConversations.id, existing.id));
  } else {
    await db.insert(gameAgentConversations).values({
      projectId,
      userId: user.sub,
      messages: fullMessages,
      tokensSpent: result.usage.totalTokens,
    });
  }

  return c.json(
    ok({
      newGameState: nextState,
      toolCalls: appliedToolCalls,
      assistantMessage: result.content,
      tokensUsed: result.usage.totalTokens,
    }),
  );
});

// GET /:projectId/conversation — load the chat history so the editor's
// right-rail dock can hydrate on mount.
gameAgentRoutes.get("/:projectId/conversation", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);

  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid projectId"), 400);
  }

  const db = getDb();
  const [project] = await db
    .select({ userId: studioProjects.userId, companyId: studioProjects.companyId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!project) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  const allowed = await canActFor(user.sub, project.userId, project.companyId ?? null);
  if (!allowed) return c.json(fail("NOT_FOUND", "Project not found"), 404);

  const [row] = await db
    .select()
    .from(gameAgentConversations)
    .where(eq(gameAgentConversations.projectId, projectId))
    .limit(1);
  return c.json(ok({ messages: row?.messages ?? [], tokensSpent: row?.tokensSpent ?? 0 }));
});

// ─── Tool dispatcher ─────────────────────────────────────────────────────
//
// Per the project DRY rule, every tool resolves to the same mutation
// helper the frontend editor calls — no duplicate "agent applies block
// placement" logic. Adding a tool is one entry in
// `shared/game-agent-tools.ts` + one case here.

function applyAgentTool(state: GameState, name: GameAgentToolName, args: unknown): GameState {
  const a = args as Record<string, unknown>;
  switch (name) {
    case "place_entity":
      return addEntity(state, a as Parameters<typeof addEntity>[1]).state;
    case "update_entity":
      return updateEntity(state, a.entityId as string, a as Parameters<typeof updateEntity>[2]);
    case "delete_entity":
      return deleteEntity(state, a.entityId as string);
    case "set_spawn":
      return updateSpawn(state, {
        position: a.position as [number, number, number],
        rotation: a.rotation as [number, number, number] | undefined,
      });
    case "set_ground":
      return updateGround(state, a as Parameters<typeof updateGround>[1]);
    case "set_lighting": {
      const lightingPatch: Parameters<typeof updateLighting>[1] = {};
      const current = state.world?.lighting;
      if (!current) return state;
      if ("ambientIntensity" in a || "ambientColor" in a) {
        lightingPatch.ambient = {
          ...current.ambient,
          ...(a.ambientIntensity != null ? { intensity: a.ambientIntensity as number } : {}),
          ...(a.ambientColor != null ? { color: a.ambientColor as string } : {}),
        };
      }
      if ("sunIntensity" in a || "sunColor" in a || "sunDirection" in a) {
        lightingPatch.sun = {
          ...current.sun,
          ...(a.sunIntensity != null ? { intensity: a.sunIntensity as number } : {}),
          ...(a.sunColor != null ? { color: a.sunColor as string } : {}),
          ...(a.sunDirection != null ? { direction: a.sunDirection as [number, number, number] } : {}),
        };
      }
      return updateLighting(state, lightingPatch);
    }
    case "set_sky_color":
      return updateSkyColor(state, a.color as string);
    case "add_challenge":
      return addChallenge(state, {
        kind: a.kind as Parameters<typeof addChallenge>[1]["kind"],
        label: a.label as string,
        params: a.params as Record<string, unknown> | undefined,
      }).state;
    case "delete_challenge":
      return deleteChallenge(state, a.challengeId as string);
  }
}

function persistedToLLM(m: PersistedMessage): LLMMessage {
  return {
    role: m.role,
    content: m.content,
    tool_calls: m.toolCalls?.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: { name: tc.name, arguments: tc.arguments },
    })),
    tool_call_id: m.toolCallId,
    name: m.name,
  };
}
