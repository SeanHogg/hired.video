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
import { BuilderforceClient } from "@seanhogg/builderforce-sdk";
import type { Env, Variables } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  USE_CASE_PROFILES,
  type InferenceProfile,
  type LLMUseCase,
} from "../../services/adapters/providers.js";

export const aiVendorRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

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
// fallback chain. SA sees what we *ask* the gateway for per action.
aiVendorRoutes.get("/use-cases", (c) => {
  const rows = (Object.keys(USE_CASE_PROFILES) as LLMUseCase[]).map((useCase) => {
    const profile = USE_CASE_PROFILES[useCase];
    const { fallbacks, ...primary } = profile;
    return {
      useCase,
      ...profileRow(primary),
      fallbacks: (fallbacks ?? []).map(profileRow),
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
