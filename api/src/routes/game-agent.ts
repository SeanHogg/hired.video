/**
 * Game-agent route — Phase-5 AI game-builder (gap #1638).
 *
 *   POST /api/studio/game-agent/:projectId/turn
 *   Body: { message: string }
 *   Response: { newGameState, toolCalls[], assistantMessage, tokensUsed }
 *
 *   GET  /api/studio/game-agent/:projectId/conversation
 *   Response: { messages[], tokensSpent }
 *
 * The turn flow (access check → LLM with tool catalog → apply tools via the
 * shared world-3d-edit seam → persist state + conversation) lives in
 * services/studio/game-agent.ts.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { createLLMClient } from "../services/adapters/llm-client.js";
import { getGameAgentConversation, runGameAgentTurn } from "../services/studio/game-agent.js";
import { success, error } from "../types/index.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const gameAgentRoutes = new Hono<AppEnv>();

const TURN_SCHEMA = z.object({
  message: z.string().min(1).max(2000),
});

gameAgentRoutes.post("/:projectId/turn", validateJson(TURN_SCHEMA, () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) {
    return c.json(error("VALIDATION_ERROR", "Invalid projectId"), 400);
  }
  const { message } = c.req.valid("json");
  const llm = createLLMClient(c.env, c.var.user);
  return c.json(success(await runGameAgentTurn(llm, userId, projectId, message)));
});

// GET /:projectId/conversation — load the chat history so the editor's
// right-rail dock can hydrate on mount.
gameAgentRoutes.get("/:projectId/conversation", async (c) => {
  const userId = requireUser(c);
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) {
    return c.json(error("VALIDATION_ERROR", "Invalid projectId"), 400);
  }
  return c.json(success(await getGameAgentConversation(userId, projectId)));
});
