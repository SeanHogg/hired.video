/**
 * /api/advertising/enrichment — contact-enrichment credits (#96).
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { enrichAndAudit } from "../../services/enrichment/index.js";
import {
  getEnrichmentCredits,
  listEnrichmentTransactions,
  spendEnrichmentCredits,
} from "../../services/enrichment/credits.js";
import { success, error } from "../../types/index.js";

export const advertisingEnrichmentRoutes = new Hono<AppEnv>();

// ─── Enrichment Credits (gap #96) ─────────────────────────────────────────────

// GET /api/advertising/enrichment/credits
advertisingEnrichmentRoutes.get("/enrichment/credits", async (c) => {
  return c.json(success(await getEnrichmentCredits(c.var.userId)));
});

// GET /api/advertising/enrichment/transactions
advertisingEnrichmentRoutes.get("/enrichment/transactions", async (c) => {
  return c.json(success(await listEnrichmentTransactions(c.var.userId, 50)));
});

// POST /api/advertising/enrichment/enrich — enrich a contact (deducts 1 credit)
advertisingEnrichmentRoutes.post("/enrichment/enrich", async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json().catch(() => ({}));
  const { email, name, company } = body as { email?: string; name?: string; company?: string };
  if (!email && !name) return c.json(error("VALIDATION_ERROR", "email or name is required"), 400);

  const spend = await spendEnrichmentCredits(userId, 1, `Contact enrichment: ${email ?? name}`);
  if (!spend.ok) {
    return c.json(error("INSUFFICIENT_CREDITS", "No enrichment credits remaining. Purchase a pack to continue."), 402);
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
  return c.json(success({
    ...enrichedResult,
    creditsRemaining: newBalance,
    message: enrichedResult.enriched
      ? null
      : "Enrichment provider not yet configured. Data will populate once ENRICHMENT_PROVIDER is set to a real provider implementation.",
  }));
});
