/**
 * /api/admin/ai-cost-reconciliation — gateway-vs-ledger drift report (#508).
 *
 * Cross-checks gateway-side aggregated cost (via builderforce-sdk
 * `client.usage.get({days})`) against our row-level `ai_usage_records`
 * for the same window. Drift highlights either a charge-drop bug on our
 * ledger or a double-billing bug on the gateway side.
 *
 * Until the gateway exposes a per-call `GET /llm/v1/usage/records`
 * endpoint, the drift report can only compare TOTALS — not individual
 * `requestId` matches. The output flags that limitation explicitly.
 */

import { Hono } from "hono";
import { gte, lt, sql } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { isAdminRole } from "../domains/billing/audience.js";

export const aiCostReconciliationRoutes = new Hono<AppEnv>();

function requireAdmin(c: any): true | Response {
  const user = c.var.user;
  if (!user) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!isAdminRole(user)) return c.json(error("FORBIDDEN", "Admin role required"), 403);
  return true;
}

aiCostReconciliationRoutes.get("/", async (c) => {
  const guard = requireAdmin(c);
  if (guard !== true) return guard;
  const days = Math.min(Math.max(parseInt(c.req.query("days") ?? "30", 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000);

  const db = getDb();
  const ledgerTable = (schema as any).aiUsageRecords;
  let ledgerTotals: { totalTokens: number; rows: number; estCostCents: number } = {
    totalTokens: 0,
    rows: 0,
    estCostCents: 0,
  };
  if (ledgerTable) {
    try {
      const [row] = await db
        .select({
          totalTokens: sql<number>`coalesce(sum(${ledgerTable.totalTokens}), 0)::int`,
          rows: sql<number>`count(*)::int`,
          estCostCents: sql<number>`coalesce(sum(${ledgerTable.costCents}), 0)::int`,
        })
        .from(ledgerTable)
        .where(gte(ledgerTable.createdAt, since));
      ledgerTotals = {
        totalTokens: Number(row?.totalTokens) || 0,
        rows: Number(row?.rows) || 0,
        estCostCents: Number(row?.estCostCents) || 0,
      };
    } catch (err) {
      // table missing — leave defaults
    }
  }

  // Gateway-side aggregated cost — bracketed by try/catch because the
  // SDK may not be configured in dev environments. The endpoint still
  // returns a useful drift = "unknown" payload when the SDK is absent.
  let gatewayTotals: { totalTokens: number | null; estCostCents: number | null; note: string } = {
    totalTokens: null,
    estCostCents: null,
    note: "Gateway SDK not configured in this deploy; gateway side unavailable.",
  };
  try {
    const builderforce = await import("@seanhogg/builderforce-sdk").catch(() => null);
    if (builderforce && (builderforce as any).createClient) {
      const env = (globalThis as any).__ENV ?? process.env ?? {};
      const apiKey = env.BUILDERFORCE_API_KEY;
      if (apiKey) {
        const client = (builderforce as any).createClient({ apiKey });
        const usage = await client.usage.get({ days });
        gatewayTotals = {
          totalTokens: Number(usage?.totals?.totalTokens) || 0,
          estCostCents: Number(usage?.totals?.totalCostCents) || 0,
          note: "Gateway totals are aggregated; per-call rows pending GET /llm/v1/usage/records (#508).",
        };
      }
    }
  } catch (err) {
    gatewayTotals = {
      totalTokens: null,
      estCostCents: null,
      note: `Gateway SDK call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const driftTokens =
    gatewayTotals.totalTokens === null
      ? null
      : Math.abs(ledgerTotals.totalTokens - gatewayTotals.totalTokens);
  const driftCostCents =
    gatewayTotals.estCostCents === null
      ? null
      : Math.abs(ledgerTotals.estCostCents - gatewayTotals.estCostCents);

  return c.json(
    success({
      days,
      since: since.toISOString(),
      ledger: ledgerTotals,
      gateway: gatewayTotals,
      drift: {
        tokens: driftTokens,
        costCents: driftCostCents,
        note:
          driftTokens === null
            ? "Drift unknown — gateway side unavailable."
            : driftTokens === 0
            ? "Aggregated totals match."
            : "Aggregated totals differ. Investigate per-feature-key spend in the AI use-case admin panel.",
      },
    }),
    200,
  );
});

aiCostReconciliationRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "AI cost reconciliation route not found" } }, 404),
);
