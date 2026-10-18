/**
 * Thin HTTP route layer for /api/match.
 *
 * All business logic lives in routes/match-handlers.ts. This file only:
 *   1. Builds MatchDeps from the Hono request env (services/job/match-deps.ts).
 *   2. Parses the JSON body.
 *   3. Delegates to the matching handler and returns its HandlerResult.
 *
 * /byid + /insights now route through the same handler layer as
 * /analyze + /tailor + /bycontent, so every endpoint is covered by the
 * fake-deps test suite.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { attachTokenBudget, checkTokenBudget, requirePro } from "../middleware/tierEnforcement.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import {
  handleAnalyze,
  handleByContent,
  handleByid,
  handleInsights,
  type MatchDeps,
} from "../services/job/match-handlers.js";
import { liveMatchDeps } from "../services/job/match-deps.js";
import { handleTailor } from "../services/job/tailor-handler.js";
import { handleCoverLetter } from "../services/job/cover-letter-handler.js";
import { handleCoverLetterTone } from "../services/job/cover-letter-tone.js";
import { createIpRateLimiter, getClientIp } from "../middleware/rateLimiter.js";
import { toHandlerResult } from "../handlers/shared.js";

export const matchRoutes = new Hono<AppEnv>();
matchRoutes.use("*", attachTokenBudget());

// ---------------------------------------------------------------------------
// Dep wiring — one source of truth for prod. Tests wire up their own.
// ---------------------------------------------------------------------------

function buildMatchDeps(c: Context<AppEnv>): MatchDeps {
  return liveMatchDeps((c.env as any) ?? {}, c.var.user);
}

async function relay(
  c: Context<AppEnv>,
  useCase: Promise<unknown>,
) {
  // Map to the envelope synchronously so a DomainError rejection is
  // observed even while the budget check is pending.
  const handlerResult = toHandlerResult(useCase);
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
  return relay(c, handleAnalyze(buildMatchDeps(c), c.var.userId ?? null, body));
});

/** POST /api/match/tailor — rewrite resume to match job */
matchRoutes.post("/tailor", async (c) => {
  // Closes gap-register #765 — Free-tier 3 tailor variations / month.
  const blocked = await servicesProcessor.enforce(c, "resume_tailor");
  if (blocked) return blocked;

  const body = await c.req.json().catch(() => null);
  const response = await relay(c, handleTailor(buildMatchDeps(c), c.var.userId ?? null, body));
  if (response.status >= 200 && response.status < 300) {
    servicesProcessor.meterEvent(c, "resume_tailor");
  }
  return response;
});

/** POST /api/match/cover-letter — the letter for a tailored résumé (Pro) */
matchRoutes.post("/cover-letter", requirePro("Cover Letter"), async (c) => {
  const body = await c.req.json().catch(() => null);
  return relay(c, handleCoverLetter(buildMatchDeps(c), c.var.userId ?? null, body));
});

// Tone rewrites are FREE (no Pro, no token budget), so the budget can't
// bound them — this per-user cap does. Generous for real use (try every
// tone a few times), tight enough to stop a loop.
const toneLimiter = createIpRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxAttempts: 20,
  message: "Too many tone rewrites. Please try again in a few minutes.",
  keyOf: (c) => `letter-tone:${(c.get("user") as { sub?: string } | undefined)?.sub ?? getClientIp(c)}`,
});

/** POST /api/match/cover-letter/tone — rewrite the letter in a tone (FREE, audited) */
matchRoutes.post("/cover-letter/tone", toneLimiter, async (c) => {
  const body = await c.req.json().catch(() => null);
  const { status, body: out } = await toHandlerResult(handleCoverLetterTone(buildMatchDeps(c), c.var.userId ?? null, body));
  return c.json(out as never, status as never);
});

/** POST /api/match/bycontent — raw-string analyze */
matchRoutes.post("/bycontent", async (c) => {
  const body = await c.req.json().catch(() => null);
  return relay(c, handleByContent(buildMatchDeps(c), c.var.userId ?? null, body));
});

/** POST /api/match/byid — analyze by persisted IDs */
matchRoutes.post("/byid", async (c) => {
  const body = await c.req.json().catch(() => null);
  return relay(c, handleByid(buildMatchDeps(c), c.var.userId ?? null, body));
});

/** POST /api/match/insights — deep career analysis (Pro only) */
matchRoutes.post("/insights", requirePro("Career Insights"), async (c) => {
  const body = await c.req.json().catch(() => null);
  return relay(c, handleInsights(buildMatchDeps(c), c.var.userId ?? null, body));
});

/** POST /api/match — redirect to analyze (canonical root) */
matchRoutes.post("/", (_c) => _c.redirect("/api/match/analyze", 307));
