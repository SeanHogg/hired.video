/**
 * /api/career360 — Career 360 target picker, gap analysis, and roadmap.
 *
 *   GET    /            — full state (saved doc + per-signal score history)
 *   POST   /suggest     — LLM proposes 3 candidate targets, persists them
 *   POST   /select      — pick one (by suggestion id or custom), runs gap
 *                          analysis + roadmap, persists, returns the plan
 *   POST   /evaluate    — re-score a single gap or roadmap step against
 *                          the seeker's current snapshot (read-only)
 *   DELETE /target      — clears the selected target (suggestions stay)
 *
 * The picker, gap engine, and roadmap renderer are intentionally one
 * surface — Career 360 is a single workflow (target → gaps → plan →
 * close). Splitting these into separate routes would force the
 * frontend to reassemble state across calls.
 */

import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { checkTokenBudget } from "../middleware/token-budget.js";
import {
  EvaluateRequestSchema,
  SelectTargetRequestSchema,
} from "../../../shared/career360-types.js";
import {
  clearTarget,
  evaluateItem,
  getCareer360State,
  selectTarget,
  suggestTargets,
} from "../services/career360/Career360Service.js";
import { buildAIErrorEnvelope } from "../services/adapters/llm-error.js";

export const career360Routes = new Hono<{ Variables: Variables }>();

career360Routes.get("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const state = await getCareer360State(userId);
  return c.json(success(state), 200);
});

career360Routes.post("/suggest", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;

  try {
    const suggestions = await suggestTargets({
      userId,
      env: (c.env as any) ?? {},
      user: c.var.user,
    });
    return c.json(success({ suggestions }), 200);
  } catch (err) {
    return aiFailure("[career360/suggest]", err, c);
  }
});

career360Routes.post("/select", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => null);
  const parsed = SelectTargetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid select-target request"), 400);
  }

  try {
    const selected = await selectTarget({
      userId,
      env: (c.env as any) ?? {},
      user: c.var.user,
      request: parsed.data,
    });
    return c.json(success({ selected }), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "SUGGESTION_NOT_FOUND") {
      return c.json(error("NOT_FOUND", "That suggestion is no longer available — refresh the picker."), 404);
    }
    if (msg === "INVALID_REQUEST") {
      return c.json(error("VALIDATION_ERROR", "Provide either fromSuggestionId or custom."), 400);
    }
    return aiFailure("[career360/select]", err, c);
  }
});

career360Routes.post("/evaluate", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => null);
  const parsed = EvaluateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Provide either gapId or roadmapStepId."), 400);
  }

  try {
    const evaluation = await evaluateItem({
      userId,
      env: (c.env as any) ?? {},
      user: c.var.user,
      request: parsed.data,
    });
    return c.json(success({ evaluation }), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NO_TARGET") {
      return c.json(error("NOT_FOUND", "Pick a target first — there's nothing to re-evaluate."), 404);
    }
    if (msg === "ITEM_NOT_FOUND") {
      return c.json(error("NOT_FOUND", "That gap or step is no longer in your plan — refresh the page."), 404);
    }
    return aiFailure("[career360/evaluate]", err, c);
  }
});

career360Routes.delete("/target", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  await clearTarget(userId);
  return c.json(success({ ok: true }), 200);
});

function aiFailure(tag: string, err: unknown, c: any) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "USER_NOT_FOUND") {
    return c.json(error("NOT_FOUND", "Your profile could not be loaded."), 404);
  }
  console.error(tag, err);
  // Structured-trail path: the LLM facade throws LLMDispatchError with
  // every per-profile attempt, gateway requestId, classifier, etc.
  // buildAIErrorEnvelope picks the right HTTP code (502 vs 503) by
  // classification and returns a payload the support ticket can carry.
  const envelope = buildAIErrorEnvelope(err);
  if (envelope) {
    return c.json(error(envelope.code, envelope.message, envelope.payload), envelope.status);
  }
  return c.json(
    error(
      "AI_UNAVAILABLE",
      "AI providers are temporarily unavailable. Please try again in a minute.",
    ),
    503,
  );
}
