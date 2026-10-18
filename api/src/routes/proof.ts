import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { getMarketingProofStats } from "../services/marketing/proof-stats.js";
import { withCacheHeaders } from "../utils/cache-headers.js";

/**
 * GET /api/proof/stats — real, anonymous-safe social-proof counts for the
 * marketing pages. No PII; aggregates only.
 */
export const proofRoutes = new Hono<AppEnv>();

proofRoutes.get("/stats", async (c) => {
  try {
    const stats = await getMarketingProofStats();
    withCacheHeaders(c, { scope: "public", maxAge: 300, sMaxAge: 3600, swr: 3600 });
    return c.json(success(stats), 200);
  } catch {
    // Proof is decorative — a failure hides the figure, never breaks the page.
    return c.json(success({ resumeBuilders: 0 }), 200);
  }
});
