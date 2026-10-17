/**
 * SuperAdmin AI spend — the ONE owner of AI cost reporting. Mounted at
 * /api/admin/sa/ai-spend on the SA console (guard applied by the admin
 * composite).
 *
 *   GET /?days=7|30|90            — AI spend vs revenue (shared/ai-spend.ts)
 *   GET /reconciliation?days=30   — gateway-vs-ledger drift report (#508)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { parseAiSpendWindow } from "../../../../shared/ai-spend.js";
import { adminRepos } from "../../repositories/admin/index.js";
import { getAiSpendReport } from "../../services/billing/aiSpendReport.js";
import { loadIsProForUsers } from "../../services/billing/effectiveUserPlan.js";
import { getAiCostReconciliation } from "../../services/admin/aiCostReconciliation.js";

export const aiSpendRoutes = new Hono<AppEnv>();

aiSpendRoutes.get("/", async (c) => {
  const repos = adminRepos();
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

aiSpendRoutes.get("/reconciliation", async (c) => {
  const days = Math.min(Math.max(parseInt(c.req.query("days") ?? "30", 10) || 30, 1), 365);
  return c.json(success(await getAiCostReconciliation(days)), 200);
});
