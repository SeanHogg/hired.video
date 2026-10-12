/**
 * /api/advertising/enrichment — contact-enrichment credits (#96).
 */

import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type { AppEnv } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { enrichAndAudit } from "../../services/enrichment/index.js";
import { spendEnrichmentCredits } from "../../services/enrichment/credits.js";
import { ok, uid } from "./http.js";

export const advertisingEnrichmentRoutes = new Hono<AppEnv>();

// ─── Enrichment Credits (gap #96) ─────────────────────────────────────────────

// GET /api/advertising/enrichment/credits
advertisingEnrichmentRoutes.get("/enrichment/credits", async (c) => {
  const userId = uid(c);
  const db = getDb();
  let [credits] = await db.select().from(schema.enrichmentCredits).where(eq(schema.enrichmentCredits.userId, userId)).limit(1);
  if (!credits) {
    // Auto-provision for Pro users: 25 monthly included credits
    [credits] = await db.insert(schema.enrichmentCredits).values({ userId, balance: 0 } as any).returning();
  }
  return c.json(ok(credits));
});

// GET /api/advertising/enrichment/transactions
advertisingEnrichmentRoutes.get("/enrichment/transactions", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const transactions = await db.select().from(schema.enrichmentTransactions)
    .where(eq(schema.enrichmentTransactions.userId, userId))
    .orderBy(desc(schema.enrichmentTransactions.createdAt))
    .limit(50);
  return c.json(ok(transactions));
});

// POST /api/advertising/enrichment/enrich — enrich a contact (deducts 1 credit)
advertisingEnrichmentRoutes.post("/enrichment/enrich", async (c) => {
  const userId = uid(c);
  const body = await c.req.json().catch(() => ({}));
  const { email, name, company } = body as { email?: string; name?: string; company?: string };
  if (!email && !name) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "email or name is required" } }, 400);

  const spend = await spendEnrichmentCredits(userId, 1, `Contact enrichment: ${email ?? name}`);
  if (!spend.ok) {
    return c.json({ success: false, error: { code: "INSUFFICIENT_CREDITS", message: "No enrichment credits remaining. Purchase a pack to continue." } }, 402);
  }
  const newBalance = spend.balanceAfter;

  // #96 — dispatch to the active provider behind the EnrichmentProvider
  // interface. The default NullEnrichmentProvider keeps the existing
  // behaviour (stub response) but every call is now audited to
  // enrichment_provider_calls regardless of upstream choice, so SA can
  // see provider drift before it becomes a billing leak.
  const enrichedResult = await enrichAndAudit(userId, {
    email,
    name,
    company,
    domain: company,
  }, 1);
  return c.json(ok({
    ...enrichedResult,
    creditsRemaining: newBalance,
    message: enrichedResult.enriched
      ? null
      : "Enrichment provider not yet configured. Data will populate once ENRICHMENT_PROVIDER is set to a real provider implementation.",
  }));
});
