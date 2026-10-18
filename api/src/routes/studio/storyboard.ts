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
import { guardGenerationPrompt } from "./http.js";
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

export const studioStoryboardRoutes = new Hono<AppEnv>();

studioStoryboardRoutes.post("/storyboard", validateJson(GenerateStoryboardSchema, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");

  // Authoritative safety gate. The LLMClient net already screens this
  // input, but the "basic" scaffold never calls the LLM at all — screen
  // here so a blocked prompt is refused outright.
  const { prompt, jobDescription, resumeText } = body;
  const blocked = guardGenerationPrompt(c, prompt, jobDescription, resumeText);
  if (blocked) return blocked;

  try {
    const script = await generateStoryboard(c.env, c.var.user, body);
    return c.json(success(script), 201);
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
  const userId = requireUser(c);
  return c.json(success(await listAdTemplatesForUser(userId, c.req.query("purpose"))));
});

studioStoryboardRoutes.post("/edit-script", validateJson(EditScriptSchema, (e) => error("INVALID_REQUEST", "Invalid request", e.flatten())), async (c) => {
  const body = c.req.valid("json");
  return c.json(success(await editStudioScript(c.env, c.var.user, body)));
});
