// SuperAdmin: AI use-case profile + gateway model visibility.
//
// End users never see which LLM serves their requests. SA can audit:
//   - which model we ASK FOR per use case (`USE_CASE_PROFILES` in
//     services/adapters/providers.ts)
//   - which model the gateway actually has available right now
//     (gateway `models.list()` — substitution may swap our hint per
//     SDK 0.4.0 docs).
//
// Mounted under /api/admin/impersonate/ai on the SA tree, so the SA
// middleware is applied at the parent (see superadmin/index.ts).

import { Hono } from "hono";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { BuilderforceClient } from "@seanhogg/builderforce-sdk";
import type { Env, Variables, AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  USE_CASE_PROFILES,
  featureKeysForUseCase,
  type InferenceProfile,
  type LLMUseCase,
} from "../../services/adapters/providers.js";
import { auditModelCatalog } from "../../services/adapters/model-catalog-audit.js";
import { getDb, schema } from "../../db/index.js";

export const aiVendorRoutes = new Hono<AppEnv>();

// Render one inference profile for the SA console. No vendor identity
// (the gateway picks; we ask). The model string is informative — it's
// our HINT to the gateway, not necessarily the model that ran. Clients
// reconcile against `_builderforce.resolvedModel` per call.
const profileRow = (profile: InferenceProfile) => ({
  modelHint: profile.model,
  temperature: profile.temperature,
  maxTokens: profile.maxTokens ?? null,
});

// GET /use-cases — full use-case → primary profile + cross-vendor
// fallback chain, plus the billing feature keys that roll up to each use
// case (#457) so SA can attribute spend per use case (e.g. all three
// `career_360_*` keys bucket under the one `career_360` row).
aiVendorRoutes.get("/use-cases", (c) => {
  const rows = (Object.keys(USE_CASE_PROFILES) as LLMUseCase[]).map((useCase) => {
    const profile = USE_CASE_PROFILES[useCase];
    const { fallbacks, ...primary } = profile;
    return {
      useCase,
      ...profileRow(primary),
      fallbacks: (fallbacks ?? []).map(profileRow),
      featureKeys: featureKeysForUseCase(useCase),
    };
  });
  return c.json(success(rows));
});

// GET /models — live gateway view of what's actually available. Lets
// SA confirm a use-case profile's `modelHint` is currently catalog-
// resolvable + not in cooldown.
aiVendorRoutes.get("/models", async (c) => {
  const apiKey = c.env?.BUILDERFORCE_API_KEY?.trim();
  if (!apiKey) {
    return c.json(success({ configured: false, data: [] }));
  }
  const sdk = new BuilderforceClient({ apiKey, baseUrl: c.env?.BUILDERFORCE_GATEWAY_URL });
  try {
    const models = await sdk.models.list();
    return c.json(success(models));
  } catch (err) {
    return c.json(
      error("MODELS_UNAVAILABLE", err instanceof Error ? err.message : String(err)),
      502,
    );
  }
});

// GET /catalog-audit — #496 — surface the unique model HINTS our
// USE_CASE_PROFILES sets ask for, joined with the live gateway catalog
// when configured. SA can spot "we still ask for `google/gemma-4-31b-
// it:free` but the gateway no longer carries it" without diffing source
// files. Detection logic is shared with the daily drift alarm (#1938) via
// `auditModelCatalog`, so the on-demand view and the cron can't diverge.
aiVendorRoutes.get("/catalog-audit", async (c) => {
  return c.json(success(await auditModelCatalog(c.env)));
});

// GET /usage — gateway's per-tenant aggregated cost reporting. Cross-
// reference against our `ai_usage_records` (per-user / per-feature_key)
// for billing reconciliation. Default 30-day window.
aiVendorRoutes.get("/usage", async (c) => {
  const apiKey = c.env?.BUILDERFORCE_API_KEY?.trim();
  if (!apiKey) {
    return c.json(success({ configured: false }));
  }
  const days = Number(c.req.query("days") ?? "30");
  const sdk = new BuilderforceClient({ apiKey, baseUrl: c.env?.BUILDERFORCE_GATEWAY_URL });
  try {
    const usage = await sdk.usage.get({ days: Number.isFinite(days) ? days : 30 });
    return c.json(success(usage));
  } catch (err) {
    return c.json(
      error("USAGE_UNAVAILABLE", err instanceof Error ? err.message : String(err)),
      502,
    );
  }
});

// GET /substitutions — #515 (option b) — silent model-substitution alarm.
// The gateway treats `model` as a HINT, not a hard pin, and may swap vendors
// on cooldown / outage / plan mismatch. For latency-pinned use cases (e.g.
// `match` requires Cerebras sub-200ms) a swap is an SLA breach. Every charged
// AI call stamps `{ substituted, requestedModel, resolvedModel }` onto its
// `usage_ledger` (event_type='ai_tokens') metadata when the resolved model
// differs from the hint (token-ledger.charge → servicesProcessor.meter). This
// reads that queryable projection back so SA can see substitution rate +
// recent breaches without grepping logs. Default 7-day window.
aiVendorRoutes.get("/substitutions", async (c) => {
  const days = Number(c.req.query("days") ?? "7");
  const since = new Date(Date.now() - (Number.isFinite(days) ? days : 7) * 86_400_000);
  const db = getDb();
  const { usageLedger } = schema;

  const substitutedCond = and(
    eq(usageLedger.eventType, "ai_tokens"),
    gte(usageLedger.createdAt, since),
    sql`${usageLedger.metadata}->>'substituted' = 'true'`,
  );

  // Grouped breach summary: requested hint → resolved model, with count +
  // last-seen, so the worst SLA offenders (e.g. match → OpenRouter) surface.
  const summary = await db
    .select({
      requestedModel: sql<string>`${usageLedger.metadata}->>'requestedModel'`,
      resolvedModel: sql<string>`${usageLedger.metadata}->>'resolvedModel'`,
      featureKey: sql<string>`${usageLedger.metadata}->>'featureKey'`,
      count: sql<number>`count(*)::int`,
      lastSeen: sql<string>`max(${usageLedger.createdAt})`,
    })
    .from(usageLedger)
    .where(substitutedCond)
    .groupBy(
      sql`${usageLedger.metadata}->>'requestedModel'`,
      sql`${usageLedger.metadata}->>'resolvedModel'`,
      sql`${usageLedger.metadata}->>'featureKey'`,
    )
    .orderBy(desc(sql`count(*)`));

  const totalSubstituted = summary.reduce((acc, r) => acc + Number(r.count), 0);

  return c.json(
    success({
      windowDays: Number.isFinite(days) ? days : 7,
      since: since.toISOString(),
      totalSubstituted,
      bySwap: summary,
    }),
  );
});
