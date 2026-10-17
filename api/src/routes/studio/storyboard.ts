/**
 * Studio script generation (W2-3a split of routes/studio.ts):
 *   POST /storyboard    — résumé/brief → VideoScript (LLM, 45s ceiling)
 *   POST /edit-script   — surgical AI edit of an existing VideoScript
 *   GET  /ad-templates  — ad-optimised template catalog
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { aiFailure } from "../../services/adapters/llm-error.js";
import {
  EditScriptSchema,
  GenerateStoryboardSchema,
  StoryboardAiError,
  editStudioScript,
  generateStoryboard,
} from "../../services/studio/storyboard-generation.js";
import { listAdTemplatesForUser } from "../../services/studio/ad-templates.js";
import { fail, guardGenerationPrompt, ok } from "./http.js";

export const studioStoryboardRoutes = new Hono<AppEnv>();

studioStoryboardRoutes.post("/storyboard", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = GenerateStoryboardSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  // Authoritative safety gate. The LLMClient net already screens this
  // input, but the "basic" scaffold never calls the LLM at all — screen
  // here so a blocked prompt is refused outright.
  const { prompt, jobDescription, resumeText } = parsed.data;
  const blocked = guardGenerationPrompt(c, prompt, jobDescription, resumeText);
  if (blocked) return blocked;

  try {
    const script = await generateStoryboard(c.env, c.var.user, parsed.data);
    return c.json(ok(script), 201);
  } catch (err) {
    // Configured-but-threw (or timed out) — surface a typed AI_* envelope
    // instead of silently serving a mock storyboard as if the AI made it.
    if (err instanceof StoryboardAiError) {
      return aiFailure(c, err.cause, "[studio/storyboard] LLM call failed");
    }
    throw err;
  }
});

studioStoryboardRoutes.get("/ad-templates", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(ok(await listAdTemplatesForUser(userId, c.req.query("purpose"))));
});

studioStoryboardRoutes.post("/edit-script", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = EditScriptSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("INVALID_REQUEST", "Invalid request", parsed.error.flatten()), 400);
  return c.json(ok(await editStudioScript(c.env, c.var.user, parsed.data)));
});
