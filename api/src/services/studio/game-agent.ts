/**
 * Game-agent use cases — Phase-5 AI game-builder (gap #1638).
 *
 * Per turn:
 *   1. Loads project + asserts the caller can act on it (canActFor).
 *   2. Pulls the persisted conversation row, appends the new user msg.
 *   3. Calls the LLM with the tool catalog from `shared/game-agent-tools.ts`.
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
 * calls in that single turn).
 */
import { toJSONSchema } from "zod";
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import { canActFor } from "./workspace.js";
import {
  findProjectAccess,
  findProjectAccessWithState,
  updateProject,
  type ProjectAccessRow,
} from "../../repositories/studioProjectsRepository.js";
import {
  findGameAgentConversation,
  insertGameAgentConversation,
  updateGameAgentConversation,
} from "../../repositories/gameAgentConversationsRepository.js";
import type { LLMClient, LLMMessage, ToolSpec } from "../adapters/llm-client.js";
import { GAME_AGENT_TOOLS, type GameAgentToolName } from "../../../../shared/game-agent-tools.js";
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
} from "../../../../shared/world-3d-edit.js";
import type { GameState } from "../../../../shared/game-state.js";

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

/** Cap history to the last 20 turns so a long-running session doesn't blow
 *  the model's context window. Older messages stay in the persisted row for
 *  the audit log + a future "scroll back" affordance. */
const RECENT_TURNS = 20;

interface PersistedMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  toolCallId?: string;
  name?: string;
}

interface AppliedToolCall {
  id: string;
  name: string;
  arguments: unknown;
  applied: boolean;
  error?: string;
}

/** Unknown, forbidden and non-game projects are rejected identically for
 *  every agent call; a project's existence never leaks to non-members. */
async function assertGameProjectAccess<T extends ProjectAccessRow>(actorId: string, project: T | null): Promise<T> {
  if (!project) throw new DomainError(404, "NOT_FOUND", "Project not found");
  const allowed = await canActFor(actorId, project.userId, project.companyId ?? null);
  if (!allowed) throw new DomainError(404, "NOT_FOUND", "Project not found");
  // The agent edits GameState, which is `state` only on a game project.
  if (project.mediaKind !== "game") {
    throw new DomainError(400, "WRONG_KIND", "This project is not a game project");
  }
  return project;
}

export async function runGameAgentTurn(
  llm: LLMClient,
  actorId: string,
  projectId: string,
  message: string,
) {
  const db = getDb();
  const project = await assertGameProjectAccess(
    actorId,
    await findProjectAccessWithState(db, projectId, "gameState"),
  );

  // ─── Load the conversation row ───────────────────────────────────────
  const existing = await findGameAgentConversation(db, projectId);
  const history: PersistedMessage[] = Array.isArray(existing?.messages)
    ? (existing!.messages as PersistedMessage[])
    : [];

  const llmMessages: LLMMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-RECENT_TURNS).map(persistedToLLM),
    { role: "user", content: message },
  ];

  // ─── Call the LLM with tool catalog ──────────────────────────────────
  let result;
  try {
    result = await llm.callMessages("studio_game_agent", {
      useCase: "studio_game_agent",
      messages: llmMessages,
      tools: TOOL_SPECS,
      toolChoice: "auto",
    });
  } catch (e) {
    logger.warn("[game-agent] LLM call failed", e);
    throw new DomainError(502, "LLM_FAILED", "AI agent could not respond. Try again.");
  }

  // ─── Apply tool calls server-side ────────────────────────────────────
  let nextState: GameState = ensureWorld(project.state as GameState);
  const appliedToolCalls: AppliedToolCall[] = [];
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

  // ─── Persist new gameState (state + baked_hash mirror) ───────────────
  if (appliedToolCalls.some((tc) => tc.applied)) {
    await updateProject(db, projectId, { state: nextState });
  }

  // ─── Append messages + persist conversation ──────────────────────────
  const newMessages: PersistedMessage[] = [
    { role: "user", content: message },
    {
      role: "assistant",
      content: result.content,
      toolCalls:
        result.toolCalls.length > 0
          ? result.toolCalls.map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }))
          : undefined,
    },
    // Tool results — one per applied call, so the next turn can reference
    // what happened.
    ...appliedToolCalls.map((tc) => ({
      role: "tool" as const,
      content: JSON.stringify({ applied: tc.applied, error: tc.error }),
      toolCallId: tc.id,
      name: tc.name,
    })),
  ];
  const fullMessages = [...history, ...newMessages];

  if (existing) {
    await updateGameAgentConversation(db, existing.id, {
      messages: fullMessages,
      tokensSpent: existing.tokensSpent + result.usage.totalTokens,
      updatedAt: new Date(),
    });
  } else {
    await insertGameAgentConversation(db, {
      projectId,
      userId: actorId,
      messages: fullMessages,
      tokensSpent: result.usage.totalTokens,
    });
  }

  return {
    newGameState: nextState,
    toolCalls: appliedToolCalls,
    assistantMessage: result.content,
    tokensUsed: result.usage.totalTokens,
  };
}

/** The persisted chat history so the editor's right-rail dock can hydrate. */
export async function getGameAgentConversation(actorId: string, projectId: string) {
  const db = getDb();
  await assertGameProjectAccess(actorId, await findProjectAccess(db, projectId));
  const row = await findGameAgentConversation(db, projectId);
  return { messages: row?.messages ?? [], tokensSpent: row?.tokensSpent ?? 0 };
}

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
