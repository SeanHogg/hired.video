/**
 * /api/resumes — the résumé-reading AI endpoints that stay résumé-scoped.
 * (Every other AI tool runs through POST /api/ai/tools/:toolId.)
 *
 *   POST /parse          upload / paste → structured résumé (SSE-capable) — optional-auth
 *   POST /extract-text   file → plain text (OCR fallback)                 — optional-auth
 *   POST /roast          public Resume Roast (was /api/resume/roast)      — optional-auth
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { DomainError } from "../../domains/errors.js";
import { servicesProcessor } from "../../domains/services-processing/index.js";
import { anonResumeAiGate } from "../../middleware/anon-resume-ai-gate.js";
import { attachTokenBudget } from "../../middleware/tierEnforcement.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { aiFailure } from "../../services/adapters/llm-error.js";
import { RoastRequestSchema, buildMockRoast, roastWithLlm } from "../../services/resume/roast.js";
import { resumeExtractTextHandler } from "../resume-extract-text.js";
import { resumeParseHandler } from "../resume-parse.js";
import { failWith, respond } from "./shared.js";

export const resumeAiRoutes = new Hono<AppEnv>();

resumeAiRoutes.post("/parse", anonResumeAiGate, attachTokenBudget(), resumeParseHandler);
resumeAiRoutes.post("/extract-text", anonResumeAiGate, attachTokenBudget(), resumeExtractTextHandler);

// Signed-in callers are billed (token budget + Free-tier 3 roasts / month,
// #765); anonymous visitors skip the gate — the marketing loss-leader.
resumeAiRoutes.post("/roast", attachTokenBudget(), async (c) => {
  const parsed = RoastRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return failWith(c, new DomainError(400, "VALIDATION_ERROR", "resumeText is required (20–50 000 chars)", parsed.error.flatten()));
  }
  const blocked = await servicesProcessor.enforce(c, "resume_roast");
  if (blocked) return blocked;

  if (!hasAnyLLMProviderKey(c.env)) {
    servicesProcessor.meterEvent(c, "resume_roast");
    return respond(c, Promise.resolve(buildMockRoast(parsed.data.resumeText)));
  }
  try {
    const roast = await roastWithLlm(createLLMClient(c.env, c.var.user), parsed.data.resumeText);
    servicesProcessor.meterEvent(c, "resume_roast");
    return respond(c, Promise.resolve(roast));
  } catch (err) {
    // Configured-but-threw: a typed AI_* envelope, never the canned roast.
    return aiFailure(c, err, "[resume/roast] LLM error");
  }
});
