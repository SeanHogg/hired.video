/**
 * Thin HTTP route layer for /api/match.
 *
 * All business logic lives in routes/match-handlers.ts. This file only:
 *   1. Builds MatchDeps from the Hono request env (db, clock, LLM).
 *   2. Parses the JSON body.
 *   3. Delegates to the matching handler and returns its HandlerResult.
 *
 * /byid + /insights now route through the same handler layer as
 * /analyze + /tailor + /bycontent, so every endpoint is covered by the
 * fake-deps test suite.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Variables } from "../types/index.js";
import { getDb } from "../db/index.js";
import { getApiKey } from "../services/adapters/ai.js";
import { attachTokenBudget, checkTokenBudget, requirePro } from "../middleware/tierEnforcement.js";
import { recordTokenUsage } from "../services/billing/BillingService.js";
import { createOpenRouterClient } from "../services/adapters/llm-client.js";
import {
  handleAnalyze,
  handleTailor,
  handleByContent,
  handleByid,
  handleInsights,
  type MatchDeps,
} from "../services/job/match-handlers.js";

export const matchRoutes = new Hono<{ Variables: Variables }>();
matchRoutes.use("*", attachTokenBudget());

// ---------------------------------------------------------------------------
// Dep wiring — one source of truth for prod. Tests wire up their own.
// ---------------------------------------------------------------------------

function buildMatchDeps(c: Context<{ Variables: Variables }>): MatchDeps {
  const env = (c.env as any) ?? {};
  const apiKey = getApiKey(env);

  return {
    db: getDb(),
    now: () => new Date(),
    llm: apiKey ? createOpenRouterClient(apiKey) : null,
    recordUsage: ({ userId, usage }) => {
      void recordTokenUsage({
        userId,
        model: usage.model,
        featureKey: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      });
    },
  };
}

async function relay(
  c: Context<{ Variables: Variables }>,
  handlerResult: Promise<{ status: number; body: unknown }>,
) {
  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;
  const { status, body } = await handlerResult;
  return c.json(body as any, status as any);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** POST /api/match/analyze — score resume vs job */
matchRoutes.post("/analyze", async (c) => {
  const body = await c.req.json().catch(() => null);
  return relay(c, handleAnalyze(buildMatchDeps(c), c.var.user?.sub ?? null, body));
});

/** POST /api/match/tailor — rewrite resume to match job */
matchRoutes.post("/tailor", async (c) => {
  const body = await c.req.json().catch(() => null);
  return relay(c, handleTailor(buildMatchDeps(c), c.var.user?.sub ?? null, body));
});

/** POST /api/match/bycontent — raw-string analyze */
matchRoutes.post("/bycontent", async (c) => {
  const body = await c.req.json().catch(() => null);
  return relay(c, handleByContent(buildMatchDeps(c), c.var.user?.sub ?? null, body));
});

/** POST /api/match/byid — analyze by persisted IDs */
matchRoutes.post("/byid", async (c) => {
  const body = await c.req.json().catch(() => null);
  return relay(c, handleByid(buildMatchDeps(c), c.var.user?.sub ?? null, body));
});

/** POST /api/match/insights — deep career analysis (Pro only) */
matchRoutes.post("/insights", requirePro("Career Insights"), async (c) => {
  const body = await c.req.json().catch(() => null);
  return relay(c, handleInsights(buildMatchDeps(c), c.var.user?.sub ?? null, body));
});

/** POST /api/match — redirect to analyze (canonical root) */
matchRoutes.post("/", (_c) => _c.redirect("/api/match/analyze", 307));

matchRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Match route not found" } }, 404),
);
