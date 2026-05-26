/**
 * /api/scorecards/bias-check — LLM bias linter (#1385).
 *
 * POST { summary?, strengths?, concerns? } → { flags: BiasFlag[] }
 * No DB writes — pure read-then-LLM endpoint. Caller's token budget is
 * debited by the existing LLM stack.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { lintScorecardText } from "../../services/scorecards/bias-linter.js";

const BiasCheckSchema = z.object({
  summary: z.string().max(5000).optional(),
  strengths: z.string().max(5000).optional(),
  concerns: z.string().max(5000).optional(),
});

export const biasRoutes = new Hono<AppEnv>();

biasRoutes.post("/", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const parsed = BiasCheckSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }
  try {
    return c.json(success(await lintScorecardText(c, parsed.data)));
  } catch (e: any) {
    return c.json(
      error(e?.code ?? "INTERNAL_ERROR", e?.message ?? "Failed to lint", undefined),
      (e?.statusCode ?? 500) as any,
    );
  }
});

export default biasRoutes;
