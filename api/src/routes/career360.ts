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
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { checkTokenBudget } from "../middleware/token-budget.js";
import {
  EvaluateRequestSchema,
  ResolveItemRequestSchema,
  SelectTargetRequestSchema,
} from "../../../shared/career360-types.js";
import {
  clearTarget,
  evaluateItem,
  getCareer360State,
  selectTarget,
  setItemResolved,
  suggestTargets,
} from "../services/career360/Career360Service.js";
import { aiFailure as sharedAiFailure } from "../services/adapters/llm-error.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const career360Routes = new Hono<AppEnv>();

career360Routes.get("/", async (c) => {
  const userId = requireUser(c);
  const state = await getCareer360State(userId);
  return c.json(success(state), 200);
});

career360Routes.post("/suggest", async (c) => {
  const userId = requireUser(c);

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

career360Routes.post("/select", validateJson(SelectTargetRequestSchema, () => error("VALIDATION_ERROR", "Invalid select-target request"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;

  const body = c.req.valid("json");

  try {
    const selected = await selectTarget({
      userId,
      env: (c.env as any) ?? {},
      user: c.var.user,
      request: body,
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

career360Routes.post("/evaluate", validateJson(EvaluateRequestSchema, () => error("VALIDATION_ERROR", "Provide either gapId or roadmapStepId."), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;

  const body = c.req.valid("json");

  try {
    const evaluation = await evaluateItem({
      userId,
      env: (c.env as any) ?? {},
      user: c.var.user,
      request: body,
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

career360Routes.post("/resolve", validateJson(ResolveItemRequestSchema, () => error("VALIDATION_ERROR", "Provide itemId, kind, and resolved."), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const body = c.req.valid("json");

  try {
    const selected = await setItemResolved({ userId, request: body });
    return c.json(success({ selected }), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NO_TARGET") {
      return c.json(error("NOT_FOUND", "Pick a target first — there's nothing to update."), 404);
    }
    if (msg === "ITEM_NOT_FOUND") {
      return c.json(error("NOT_FOUND", "That gap or step is no longer in your plan — refresh the page."), 404);
    }
    return c.json(error("INTERNAL_ERROR", "Couldn't update that item."), 500);
  }
});

career360Routes.delete("/target", async (c) => {
  const userId = requireUser(c);
  await clearTarget(userId);
  return c.json(success({ ok: true }), 200);
});

function aiFailure(tag: string, err: unknown, c: any) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "USER_NOT_FOUND") {
    return c.json(error("NOT_FOUND", "Your profile could not be loaded."), 404);
  }
  // Delegate the AI-failure shape (structured trail, correlationId,
  // 429/502/503 selection) to the single shared seam.
  return sharedAiFailure(c, err, tag);
}
