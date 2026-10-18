// auto-apply.ts — Autonomous job application agent (#77)
// Applies to jobs on behalf of the user: tailors resume + cover letter via AI,
// submits the application, and tracks pipeline status.

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { rankAutoApplyMatches, startAutoApply } from "../services/job/auto-apply.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import { clampLimit } from "../utils/pagination.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const autoApplyRoutes = new Hono<AppEnv>();

const StartAutoApplySchema = z.object({
  jobIds: z.array(UuidLikeSchema).min(1).max(20),
  resumeId: UuidLikeSchema.optional(),
  // Optional custom instructions for the AI tailoring
  customInstructions: z.string().max(1000).optional(),
  // If true, actually submit to the platform; if false, only draft (dry run)
  submitNow: z.boolean().default(false),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/auto-apply/start (Pro)
 * Tailors resume/cover letter for each job via LLM and queues applications.
 * Body: { jobIds[], resumeId?, customInstructions?, submitNow }
 */
autoApplyRoutes.post("/start", requirePro("Auto-Apply Agent"), validateJson(StartAutoApplySchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const llm = hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user) : null;
  return c.json(success(await startAutoApply(llm, userId, c.req.valid("json"))), 200);
});

/**
 * GET /api/auto-apply/matches (Pro)
 * Returns AI-ranked job matches for the user based on their resume.
 * ?limit=10
 */
autoApplyRoutes.get("/matches", requirePro("Auto-Apply Agent"), async (c) => {
  const userId = requireUser(c);
  const limit = clampLimit(c.req.query("limit"), 10, 50);
  const llm = () => (hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user) : null);
  return c.json(success(await rankAutoApplyMatches(llm, userId, limit)), 200);
});
