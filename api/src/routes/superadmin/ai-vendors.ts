// SuperAdmin: AI vendor / model visibility.
//
// End users (free or paid) never see which LLM serves their requests —
// vendor selection is server-owned, driven by a use-case → model
// mapping (see services/adapters/providers.ts). This router exposes that
// mapping (and the underlying provider catalog) to SA so they can audit
// which vendor is wired up to each action without reading source.
//
// The router is mounted under /api/admin/impersonate on the SA tree, so
// SA middleware is already applied at the parent (see superadmin/index.ts).
// We do NOT repeat the gate here.

import { Hono } from "hono";
import type { Variables } from "../../types/index.js";
import { success } from "../../types/index.js";
import { MODEL_CATALOG } from "../../services/adapters/ai.js";
import {
  PROVIDERS,
  USE_CASE_PROFILES,
  resolveProviderForModel,
  type InferenceProfile,
  type LLMUseCase,
  type ProviderId,
} from "../../services/adapters/providers.js";

export const aiVendorRoutes = new Hono<{ Variables: Variables }>();

// Single source of truth for "what does SA need to see about one
// inference profile?" — pulled out so /use-cases primary + fallback rows
// share the exact same shape.
const profileRow = (
  profile: InferenceProfile,
  catalogById: Map<string, (typeof MODEL_CATALOG)[number]>,
) => {
  const meta = catalogById.get(profile.model);
  const provider = (meta?.provider ?? resolveProviderForModel(profile.model)) as ProviderId;
  return {
    modelId: profile.model,
    modelLabel: meta?.label ?? profile.model,
    tier: meta?.tier ?? "free",
    context: meta?.context ?? null,
    provider,
    providerLabel: PROVIDERS[provider].label,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens ?? null,
  };
};

// GET /use-cases — full use-case → (primary profile + cross-provider
// fallback chain). Each row tells SA exactly which vendor + sampling
// profile serves a given action AND which vendor takes over on outage.
// End users never see this data.
aiVendorRoutes.get("/use-cases", (c) => {
  const catalogById = new Map(MODEL_CATALOG.map((m) => [m.id, m] as const));

  const rows = (Object.keys(USE_CASE_PROFILES) as LLMUseCase[]).map((useCase) => {
    const profile = USE_CASE_PROFILES[useCase];
    const { fallbacks, ...primary } = profile;
    return {
      useCase,
      ...profileRow(primary, catalogById),
      fallbacks: (fallbacks ?? []).map((p) => profileRow(p, catalogById)),
    };
  });

  return c.json(success(rows));
});

// GET /providers — registry view: provider id, label, endpoint, default
// model, fallback chain. Lets SA confirm Cerebras / OpenRouter / future
// vendors are configured the way they expect without grepping code.
aiVendorRoutes.get("/providers", (c) => {
  const rows = (Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
    const p = PROVIDERS[id];
    return {
      id: p.id,
      label: p.label,
      endpoint: p.endpoint,
      defaultModel: p.defaultModel,
      fallbackChain: p.fallbackChain,
      timeoutMs: p.timeoutMs,
    };
  });
  return c.json(success(rows));
});
