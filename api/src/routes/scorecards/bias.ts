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
import { validateJson } from "../helpers/validate.js";

const BiasCheckSchema = z.object({
  summary: z.string().max(5000).optional(),
  strengths: z.string().max(5000).optional(),
  concerns: z.string().max(5000).optional(),
});

export const biasRoutes = new Hono<AppEnv>();

biasRoutes.post("/", validateJson(BiasCheckSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  try {
    return c.json(success(await lintScorecardText(c, body)));
  } catch (e: any) {
    return c.json(
      error(e?.code ?? "INTERNAL_ERROR", e?.message ?? "Failed to lint", undefined),
      (e?.statusCode ?? 500) as any,
    );
  }
});

export default biasRoutes;
