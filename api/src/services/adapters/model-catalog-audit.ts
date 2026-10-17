// Model-catalog drift audit — the guard that catches a pinned LLM model ID
// going retired BEFORE it 503s a user-blocking flow (gap #1938; root cause of
// gap #1937, where `anthropic/claude-3-haiku` retired out from under the paid
// terminal pool and nothing noticed until production AI_UNAVAILABLE errors).
//
// Detection primitive: compare every model string our `USE_CASE_PROFILES`
// chains ask the gateway for against the gateway's live catalog
// (`sdk.models.list()`). A configured model absent from the catalog = retired /
// renamed / no longer served. Zero-cost (one catalog read, no inference), and
// far more reliable than probing — the gateway masks a retired model by
// substituting/cascading to other vendors (exactly what made llm-71b468dd hard
// to read), so a probe can't cleanly tell "retired" from "transient 429".
//
// Exception: `models.list()` lists only the plan's routing pool + connected
// providers — direct Claude ids are NEVER in it (model-request-rules.ts
// `isListedInGatewayCatalog`). Diffing them against the list was a guaranteed
// false alarm, so those few ids get one cheap `modelStrict` probe instead,
// where strict means a genuine "not served" is distinguishable from a blip.
//
// Single source of truth for both the on-demand SA endpoint
// (routes/superadmin/ai-vendors.ts `/catalog-audit`) and the daily scheduled
// drift alarm (scheduled.ts), so the walk + catalog-match logic can't drift
// between them.

import { BuilderforceClient, BuilderforceApiError } from "@seanhogg/builderforce-sdk";
import { USE_CASE_PROFILES, type LLMUseCase } from "./providers.js";
import { buildModelRequestParams, isListedInGatewayCatalog } from "./model-request-rules.js";
import { escapeHtml } from "../../../../shared/html-escape.js";

export interface ModelCatalogRow {
  /** The `vendor/model[:tier]` hint our profiles send to the gateway. */
  model: string;
  /** Every use case whose chain references this model. */
  useCases: LLMUseCase[];
  /** `true` present in catalog, `false` absent (retired/renamed), `null` when
   *  the gateway couldn't be reached/was unconfigured (audit inconclusive). */
  availableInGateway: boolean | null;
}

export interface ModelCatalogAudit {
  /** False when the gateway is unconfigured or unreachable — callers must NOT
   *  treat `missing` as actionable in that case (every row is `null`). */
  gatewayChecked: boolean;
  models: ModelCatalogRow[];
  /** Configured models absent from the gateway catalog (the actionable set). */
  missing: string[];
  auditedAt: string;
}

export interface CatalogAuditEnv {
  BUILDERFORCE_API_KEY?: string;
  BUILDERFORCE_GATEWAY_URL?: string;
}

/** Walk every use-case profile + fallback chain → `model → useCases[]`. The
 *  distinct set of model strings we depend on the gateway to serve. */
export function collectConfiguredModels(): Map<string, LLMUseCase[]> {
  const map = new Map<string, Set<LLMUseCase>>();
  for (const useCase of Object.keys(USE_CASE_PROFILES) as LLMUseCase[]) {
    const profile = USE_CASE_PROFILES[useCase];
    const models = [profile.model, ...(profile.fallbacks ?? []).map((f) => f.model)];
    for (const m of models) {
      let set = map.get(m);
      if (!set) {
        set = new Set();
        map.set(m, set);
      }
      set.add(useCase);
    }
  }
  return new Map(
    Array.from(map, ([m, s]) => [m, Array.from(s).sort()] as [string, LLMUseCase[]]),
  );
}

/** Bare model id — drop the `vendor/` prefix and the `:tier` suffix so a
 *  `vendor/model:free` hint matches a catalog that may list models bare,
 *  vendor-prefixed, or split into `{vendor, model}` fields. */
export function bareModelId(s: string): string {
  return s.split("/").pop()!.split(":")[0];
}

/** Build the catalog match-set from a raw `models.list()` response. Each entry
 *  is indexed by its full form, `vendor/model`, `id`, and bare id so our hints
 *  match regardless of how the gateway version shapes the list (bare,
 *  vendor-prefixed, or split `{vendor, model}`). Pure + exported for testing. */
export function buildCatalogMatchSet(res: unknown): Set<string> {
  const list = Array.isArray(res)
    ? res
    : ((res as { data?: unknown[] } | null)?.data ?? []);
  const set = new Set<string>();
  const add = (form: string) => {
    if (!form) return;
    set.add(form);
    set.add(bareModelId(form));
  };
  for (const entry of list as Array<Record<string, unknown>>) {
    const model = typeof entry?.model === "string" ? entry.model : "";
    const id = typeof entry?.id === "string" ? entry.id : "";
    const vendor = typeof entry?.vendor === "string" ? entry.vendor : "";
    add(model);
    add(id);
    if (vendor && model) add(`${vendor}/${model}`);
  }
  const looseModels = !Array.isArray(res)
    ? (res as { models?: unknown } | null)?.models
    : undefined;
  if (Array.isArray(looseModels)) {
    for (const m of looseModels) if (typeof m === "string") add(m);
  }
  return set;
}

/** Whether a configured `vendor/model[:tier]` hint resolves against a catalog
 *  match-set — exact form or bare id. Pure + exported for testing. */
export function isConfiguredModelPresent(model: string, catalog: Set<string>): boolean {
  return catalog.has(model) || catalog.has(bareModelId(model));
}

function gatewayClient(env: CatalogAuditEnv | undefined): BuilderforceClient | null {
  const apiKey = env?.BUILDERFORCE_API_KEY?.trim();
  return apiKey ? new BuilderforceClient({ apiKey, baseUrl: env?.BUILDERFORCE_GATEWAY_URL }) : null;
}

/** Fetch the gateway's live model catalog as a match-set. Returns null on
 *  unconfigured/unreachable — the caller renders that as "inconclusive", never
 *  as "everything retired". */
async function fetchGatewayCatalog(sdk: BuilderforceClient | null): Promise<Set<string> | null> {
  if (!sdk) return null;
  try {
    return buildCatalogMatchSet(await sdk.models.list());
  } catch {
    return null;
  }
}

/** Map a strict-probe failure to a verdict: `false` only when the gateway
 *  says the model is genuinely not served (404, or `model_unavailable` for a
 *  reason other than a transient cooldown); anything else is inconclusive.
 *  Pure + exported for testing. */
export function classifyProbeError(err: unknown): false | null {
  if (!(err instanceof BuilderforceApiError)) return null;
  if (err.status === 404) return false;
  if (err.status === 503 && err.code === "model_unavailable") {
    const reason = (err.details as { reason?: unknown } | undefined)?.reason;
    return reason === "cooldown" ? null : false;
  }
  return null;
}

/** One strict, minimal completion against a model the catalog can't list. */
async function probeModel(sdk: BuilderforceClient, model: string): Promise<boolean | null> {
  const { attemptTimeoutMs, ...params } = buildModelRequestParams(
    { model, temperature: 0, maxTokens: 1 },
    undefined,
    false,
  );
  try {
    await sdk.chat.completions.create({
      ...params,
      messages: [{ role: "user", content: "ping" }],
      useCase: "model_catalog_audit",
      stream: false,
      ...(attemptTimeoutMs !== undefined ? { timeoutMs: attemptTimeoutMs } : {}),
    });
    return true;
  } catch (err) {
    return classifyProbeError(err);
  }
}

/** Diff configured models against an already-fetched catalog set (or null when
 *  the gateway was unreachable). Models the catalog never lists take their
 *  verdict from `probed` (absent = inconclusive). Pure — the testable core of
 *  the audit. */
export function auditAgainstCatalog(
  configured: Map<string, LLMUseCase[]>,
  catalog: Set<string> | null,
  probed: ReadonlyMap<string, boolean | null> = new Map(),
): ModelCatalogAudit {
  const verdict = (model: string): boolean | null => {
    if (!isListedInGatewayCatalog(model)) return probed.get(model) ?? null;
    return catalog === null ? null : isConfiguredModelPresent(model, catalog);
  };
  const models: ModelCatalogRow[] = Array.from(configured.entries())
    .map(([model, useCases]) => ({
      model,
      useCases,
      availableInGateway: verdict(model),
    }))
    .sort((a, b) => a.model.localeCompare(b.model));

  return {
    gatewayChecked: catalog !== null,
    models,
    missing: models.filter((r) => r.availableInGateway === false).map((r) => r.model),
    auditedAt: new Date().toISOString(),
  };
}

/** Audit every configured model against the live gateway catalog. */
export async function auditModelCatalog(env: CatalogAuditEnv | undefined): Promise<ModelCatalogAudit> {
  const configured = collectConfiguredModels();
  const sdk = gatewayClient(env);
  const unlisted = [...configured.keys()].filter((m) => !isListedInGatewayCatalog(m));
  const [catalog, probes] = await Promise.all([
    fetchGatewayCatalog(sdk),
    Promise.all(unlisted.map(async (m) => [m, sdk ? await probeModel(sdk, m) : null] as const)),
  ]);
  return auditAgainstCatalog(configured, catalog, new Map(probes));
}

/** Render the drift-alert email body. Lists each missing model + the use cases
 *  it would 503 if the free pool also degrades. Pure + exported for testability
 *  and reuse by any future "email me the audit" SA action. */
export function formatModelDriftEmailHtml(audit: ModelCatalogAudit): string {
  const rows = audit.models
    .filter((r) => r.availableInGateway === false)
    .map(
      (r) =>
        `<tr><td style="padding:4px 12px 4px 0;font-family:monospace;font-size:12px;">${escapeHtml(r.model)}</td>` +
        `<td style="padding:4px 0;font-size:12px;color:#444;">${escapeHtml(r.useCases.join(", "))}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;max-width:760px;margin:0 auto;padding:24px;">
    <h2 style="margin-top:0;">hired.video — LLM model-catalog drift</h2>
    <p style="font-size:14px;color:#444;background:#fff5f5;border:1px solid #fecaca;padding:12px;border-radius:4px;">
      ${audit.missing.length} configured model(s) are no longer in the Builderforce gateway catalog (retired / renamed).
      Update <code>api/src/services/adapters/providers.ts</code> — these will 503 the listed use cases once the free pool degrades (see gap #1937).
    </p>
    <table style="border-collapse:collapse;font-size:13px;margin-top:16px;">
      <tr><th style="text-align:left;padding-right:12px;">Missing model</th><th style="text-align:left;">Use cases</th></tr>
      ${rows}
    </table>
    <p style="margin-top:24px;font-size:11px;color:#999;">Audited ${escapeHtml(audit.auditedAt)} · from scheduled.ts processModelCatalogDrift (gap #1938).</p>
  </body></html>`;
}
