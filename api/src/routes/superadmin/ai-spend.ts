/**
 * GET /api/admin/impersonate/ai-spend?days=7|30|90 — SuperAdmin AI spend vs
 * revenue report (shared/ai-spend.ts). Mounted on the SA tree, so the
 * SuperAdmin middleware is applied at the parent.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { parseAiSpendWindow } from "../../../../shared/ai-spend.js";
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { getAiSpendReport } from "../../services/billing/aiSpendReport.js";
import { loadIsProForUsers } from "../../services/billing/effectiveUserPlan.js";

export const aiSpendRoutes = new Hono<AppEnv>();

aiSpendRoutes.get("/", async (c) => {
  const repos = buildRepos(getDb());
  const report = await getAiSpendReport(
    {
      tokens: repos.tokens,
      users: repos.users,
      isProForUsers: (ids) => loadIsProForUsers(ids, repos),
      now: () => new Date(),
    },
    parseAiSpendWindow(c.req.query("days")),
  );
  return c.json(success(report));
});
