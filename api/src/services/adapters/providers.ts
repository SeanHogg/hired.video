/**
 * LLM provider registry — single source of truth for which vendors we
 * support, where their endpoints live, which models each one serves, and
 * which env var holds its API key.
 *
 * ── Adding a new vendor ──────────────────────────────────────────────
 *   1. Append the new provider id to `ProviderId`.
 *   2. Add a block to `PROVIDERS` (endpoint, models[], apiKeyEnvVar, …).
 *   3. Add `<NAME>_API_KEY?: string` to `ProviderEnv` below AND to
 *      `Env` in `types/index.ts` so wrangler binds the secret.
 * That's it. `MODEL_CATALOG`, `MODEL_TO_PROVIDER`, the API-key lookup,
 * the SA `/use-cases` and `/providers` endpoints, and the runtime
 * fallback chain ALL derive from this one block. No parallel tables to
 * keep in sync.
 *
 * Why a registry instead of one file per provider:
 *   - The wire format is identical (OpenAI chat-completions). One shared
 *     transport in `openai-compat.ts` handles every vendor.
 *   - Routing-by-model needs ONE table; multiple files would mean
 *     walking a discovery API every call.
 *   - DRY: per-provider files would duplicate the fallback loop, the
 *     usage parsing, and the timeout handling. We already saw drift
 *     between `callLLMWithUsage` and `callLLMWithMessagesAndUsage`
 *     before that loop got pulled out.
 */

export type ProviderId = "openrouter" | "cerebras" | "ollama";

/**
 * Metadata about one model a vendor exposes. Stored on the provider so
 * `MODEL_CATALOG`, `MODEL_TO_PROVIDER`, and the per-provider fallback
 * chain all derive from one list — adding a model is one entry, not
 * three sites to touch.
 */
export interface ModelMetadata {
  /** Vendor-specific id used on the wire (e.g. "llama3.1-8b"). */
  id: string;
  /** Human-readable label for the SA admin UI and audit logs. */
  label: string;
  /** "free" = no per-call cost to us; "paid" = metered. */
  tier: "free" | "paid";
  /** Best-known context window in tokens. Used by the SA tooling only. */
  context: number;
}

export interface ProviderConfig {
  id: ProviderId;
  /** Human label for logs and the SA `/providers` endpoint. */
  label: string;
  /** Full OpenAI-compatible chat-completions endpoint URL. */
  endpoint: string;
  /** Extra headers to send on every call (auth is added separately). */
  headers?: Record<string, string>;
  /**
   * Models this vendor serves, in priority order. The provider's
   * INTERNAL model fallback walks this list (first entry is the
   * default; later entries are tried when an earlier one fails).
   * Cross-provider fallback is opt-in per use case via
   * `UseCaseProfile.fallbacks` — a vendor never auto-hops to another
   * vendor on its own (that would silently change pricing/quotas).
   */
  models: readonly ModelMetadata[];
  /** Env var on `ProviderEnv` / `Env` that holds this vendor's API key. */
  apiKeyEnvVar: keyof ProviderEnv;
  /** Per-request timeout (ms). One slow vendor must not stall the chain. */
  timeoutMs: number;
}

/**
 * The default model a vendor is asked to serve when no specific model
 * is requested. Centralised so the field is derivable rather than
 * duplicated alongside `models[0]`.
 */
export function defaultModelOf(p: ProviderConfig): string {
  return p.models[0]?.id ?? "";
}

/**
 * The full ordered fallback chain for a vendor — just `models[*].id`.
 * Pulled into a helper so the runtime caller doesn't have to know the
 * shape of `models[]`.
 */
export function fallbackChainOf(p: ProviderConfig): readonly string[] {
  return p.models.map((m) => m.id);
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    headers: {
      "HTTP-Referer": "https://hired.video",
      "X-Title": "hired.video",
    },
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    timeoutMs: 45_000,
    // Verified working on OpenRouter as of 2026-04-20 (user-validated).
    // Tried in order; first one that responds with valid JSON wins.
    // First entry is also the default when no model is requested.
    models: [
      { id: "google/gemma-4-31b-it:free",                label: "Gemma 4 31B",           tier: "free", context: 131_072 },
      { id: "google/gemma-4-26b-a4b-it:free",            label: "Gemma 4 26B A4B",       tier: "free", context: 131_072 },
      { id: "openrouter/elephant-alpha",                 label: "Auto (best available)", tier: "free", context: 200_000 },
      { id: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Hermes 3 Llama 405B",   tier: "free", context: 131_072 },
      { id: "tencent/hy3-preview:free",                  label: "Tencent HunYuan 3",     tier: "free", context: 131_072 },
      { id: "openai/gpt-oss-120b:free",                  label: "GPT OSS 120B",          tier: "free", context: 131_072 },
      { id: "meta-llama/llama-3.3-70b-instruct:free",    label: "Llama 3.3 70B",         tier: "free", context: 131_072 },
      { id: "z-ai/glm-4.5-air:free",                     label: "GLM 4.5 Air",           tier: "free", context: 128_000 },
      { id: "qwen/qwen3-next-80b-a3b-instruct:free",     label: "Qwen 3 80B MoE",        tier: "free", context: 262_144 },
      { id: "nvidia/nemotron-nano-9b-v2:free",           label: "Nemotron Nano 9B",      tier: "free", context: 128_000 },
      { id: "qwen/qwen3-coder:free",                     label: "Qwen 3 Coder",          tier: "free", context: 256_000 },
      // Paid models on OpenRouter — only used when a use-case profile
      // explicitly opts in (cross-provider routing happens by id, not
      // by tier, so leaving these in the chain is harmless).
      { id: "openai/gpt-4o-mini",                        label: "GPT-4o Mini",           tier: "paid", context: 128_000 },
      { id: "openai/gpt-4o",                             label: "GPT-4o",                tier: "paid", context: 128_000 },
      { id: "anthropic/claude-3-haiku",                  label: "Claude 3 Haiku",        tier: "paid", context: 200_000 },
    ],
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    // Cerebras exposes an OpenAI-compatible REST endpoint, so we use the
    // same fetch path as OpenRouter rather than pulling in their SDK
    // (which is Node-shaped and harder to ship on Cloudflare Workers).
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    apiKeyEnvVar: "CEREBRAS_API_KEY",
    // Cerebras inference is famously fast — give it a tighter timeout so
    // we don't sit on a hung request when we could be trying the next one.
    timeoutMs: 20_000,
    // Production model first, preview model second.
    models: [
      { id: "llama3.1-8b",                    label: "Llama 3.1 8B (Cerebras)",     tier: "free", context: 8_192  },
      { id: "qwen-3-235b-a22b-instruct-2507", label: "Qwen 3 235B A22B (Cerebras)", tier: "free", context: 65_536 },
    ],
  },
  ollama: {
    id: "ollama",
    label: "Ollama Cloud",
    // Ollama Cloud exposes an OpenAI-compatible /v1/chat/completions
    // endpoint, so we plug it in via the same fetch path as the other
    // providers — no `ollama` SDK dependency, which keeps Worker bundle
    // size flat and avoids Node-specific shims.
    endpoint: "https://ollama.com/v1/chat/completions",
    apiKeyEnvVar: "OLLAMA_API_KEY",
    timeoutMs: 30_000,
    // Strongest reasoning models first, smaller / specialised models last.
    // Context windows are best-known approximations; SA can confirm via
    // the upstream model card if a use case starts hitting truncation.
    models: [
      { id: "gpt-oss:120b",            label: "GPT-OSS 120B (Ollama)",      tier: "paid", context: 131_072 },
      { id: "kimi-k2.6:cloud",         label: "Kimi K2.6 (Ollama)",         tier: "paid", context: 200_000 },
      { id: "glm-5.1:cloud",           label: "GLM 5.1 (Ollama)",           tier: "paid", context: 128_000 },
      { id: "deepseek-v4-flash:cloud", label: "DeepSeek v4 Flash (Ollama)", tier: "paid", context: 128_000 },
      { id: "qwen3-coder-next",        label: "Qwen 3 Coder Next (Ollama)", tier: "paid", context: 262_144 },
      { id: "qwen3.5",                 label: "Qwen 3.5 (Ollama)",          tier: "paid", context: 131_072 },
      { id: "gemma4",                  label: "Gemma 4 (Ollama)",           tier: "paid", context: 131_072 },
      { id: "ministral-3",             label: "Ministral 3 (Ollama)",       tier: "paid", context: 32_768  },
    ],
  },
};

/**
 * Models we know about, mapped to the provider that serves them.
 *
 * Derived from `PROVIDERS[*].models` so the map can never drift out of
 * sync with what each vendor actually exposes (DRY — adding a model to
 * a vendor auto-registers it for routing AND for the SA catalog AND
 * for the runtime fallback chain).
 *
 * OpenRouter is the implicit default for any model NOT listed here, so
 * we skip its catalog when building the table — `resolveProviderForModel`
 * falls through to "openrouter" for unknown ids, matching the historical
 * behaviour from before this registry existed.
 *
 * If two providers ever serve a model with the same id, the one whose
 * key sorts first in PROVIDERS wins; in practice we don't share ids
 * across vendors (Cerebras's `llama3.1-8b` is its own SKU, not the
 * meta-llama OpenRouter version).
 */
export const MODEL_TO_PROVIDER: Record<string, ProviderId> = (() => {
  const map: Record<string, ProviderId> = {};
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
    if (id === "openrouter") continue; // implicit default — see above
    for (const model of PROVIDERS[id].models) {
      // First non-OpenRouter provider to claim a model wins.
      if (!(model.id in map)) map[model.id] = id;
    }
  }
  return map;
})();

/**
 * Resolve the provider for a given model id. Defaults to OpenRouter for
 * unknown models — that matches the historical behavior of the codebase
 * (everything was OpenRouter before this registry existed) and keeps the
 * 31 existing call sites working without changes.
 */
export function resolveProviderForModel(model: string | undefined): ProviderId {
  if (!model) return "openrouter";
  return MODEL_TO_PROVIDER[model] ?? "openrouter";
}

/**
 * Use cases — the only thing route code passes to the facade. We pick
 * the "best LLM for the action" from this mapping internally, weighing
 * latency / structured-output quality / context size / creative voice.
 *
 * Why a fixed enum:
 *   - End users (free or paid) NEVER pick a model. The facade owns the
 *     selection so we can rebalance vendors without touching routes.
 *   - SuperAdmin observability: the use-case label gets recorded with
 *     every call (via `featureKey` in `recordTokenUsage`), so SA can
 *     query "which use cases are burning the most tokens / which ones
 *     are landing on which vendor today" without grepping route code.
 *   - DRY: the mapping is one table; adding a use case is a one-entry
 *     change here, not a new conditional in some route file.
 */
export type LLMUseCase =
  | "studio_script"          // long-form video script generation (structured JSON, narrative)
  | "studio_edit_script"     // small targeted edits to an existing script
  | "chat"                   // multi-turn AI career assistant
  | "resume_roast"           // creative critique of a resume
  | "resume_optimize"        // structured rewriting / ATS tailoring
  | "match"                  // job ↔ resume scoring (fast, deterministic)
  | "match_tailor"           // tailoring a resume to a specific job (structured rewrite)
  | "match_insights"         // deep career-fit analysis (reasoning-heavy, longer output)
  | "interview_questions"    // generating an interview question set
  | "interview_analyze"      // grading a candidate's answer
  | "autofill"               // form-field generation
  | "skill_extract"          // entity extraction from job postings / resumes
  | "linkedin_post"          // social copy generation
  | "career"                 // career-advice chat
  | "discovery"              // job-discovery summarisation
  | "reviews"                // assessment scoring
  | "auto_apply"             // form-fill auto-apply orchestration
  | "company_brief"          // company / recruiter brief summarisation
  | "recruiter_match"        // recruiter ↔ candidate matching
  | "recruiter_outreach"     // recruiter outreach copy
  | "dashboard_summary"      // dashboard digest / weekly summary
  | "article_writer"         // long-form article drafting
  | "job_parser"             // parsing job postings into structured form
  | "resume_merge"           // merging multiple resumes / variations
  | "resume_summary"         // recruiter-ready prose summary of a resume
  | "resume_consolidate_highlights" // collapse/rewrite a single section's bullet list (work/volunteer/project)
  | "studio_misc"            // ancillary studio LLM calls (tags, captions, B-roll prompts)
  | "profile_audit"          // candidate profile audit + headline/summary rewrite (structured JSON)
  | "salary_estimate"        // salary calculator — title × location × industry × experience → structured JSON
  | "salary_negotiation"     // salary negotiation strategies + talking points (narrative)
  | "default";               // fallback — used when migration hasn't tagged the call site yet

/**
 * Per-use-case "secret sauce" — the full inference profile we apply when
 * a route hands the facade a use case. Includes:
 *
 *   - `model`       — the vendor-specific model id we route to.
 *   - `temperature` — sampling temperature. Creative work runs hotter
 *                     (0.7–0.9), structured-JSON / scoring runs colder
 *                     (0.0–0.4). End users do NOT control this — the
 *                     temperature for "studio_script" is a tuned product
 *                     decision, not a knob.
 *   - `maxTokens`   — optional cap on completion length, where it
 *                     materially affects cost or quality.
 *
 * Tuned for the workload, not for parity:
 *   - Structured-JSON-heavy use cases lean on Qwen Coder / Claude Haiku.
 *   - Latency-critical scoring uses Cerebras (single-digit ms TTFT).
 *   - Long-form / narrative leans on Hermes 3 / Llama 3.3.
 *   - Cheap small fields (autofill) ride on the smallest free Gemma.
 *
 * Visible to SA via `GET /api/superadmin/ai/use-cases`. To change a
 * binding for a single deploy, edit this map; the facade picks up the
 * new profile on the next call. End users (free or paid) never see
 * these values.
 */
/** A leaf inference profile — model + sampling, no further fallbacks. */
export interface InferenceProfile {
  model: string;
  temperature: number;
  maxTokens?: number;
}

export interface UseCaseProfile extends InferenceProfile {
  /**
   * Cross-provider fallback chain. If the primary provider's INTERNAL
   * model fallback (PROVIDERS[id].fallbackChain) exhausts without success,
   * the facade tries each entry here in order, picking the right API key
   * for whichever provider serves it.
   *
   * Use sparingly. Falling back from Cerebras to OpenRouter for `match`
   * is a 10–50× latency change — better than failing, but the user will
   * notice. Don't add cross-provider fallback to use cases that already
   * live on an OpenRouter free model (the per-provider chain there is
   * 11 models deep and rarely fails outright).
   */
  fallbacks?: InferenceProfile[];
}

export const USE_CASE_PROFILES: Record<LLMUseCase, UseCaseProfile> = {
  // Studio script: Anthropic Haiku is the best narrative + structured-JSON
  // pick, but it's paid — fall back to a free OpenRouter model on outage so
  // paid users aren't worse off than free users when Anthropic is down.
  studio_script:        {
    model: "anthropic/claude-3-haiku",
    temperature: 0.7,
    fallbacks: [
      { model: "qwen/qwen3-next-80b-a3b-instruct:free", temperature: 0.7 },
    ],
  },
  studio_edit_script:   { model: "google/gemma-4-31b-it:free",                  temperature: 0.4  },
  chat:                 { model: "meta-llama/llama-3.3-70b-instruct:free",      temperature: 0.7  },
  resume_roast:         { model: "nousresearch/hermes-3-llama-3.1-405b:free",   temperature: 0.85 },
  resume_optimize:      { model: "qwen/qwen3-coder:free",                       temperature: 0.3  },
  // Match: Cerebras for sub-200ms TTFT. If Cerebras is down (or the API
  // key isn't configured), cross over to a structured-output OpenRouter
  // model. The user will see slower scoring, but won't see "AI is down".
  match:                {
    model: "llama3.1-8b",
    temperature: 0.2,
    fallbacks: [
      { model: "qwen/qwen3-coder:free", temperature: 0.2 },
    ],
  },
  match_tailor:         { model: "qwen/qwen3-next-80b-a3b-instruct:free",       temperature: 0.4  },
  match_insights:       { model: "nousresearch/hermes-3-llama-3.1-405b:free",   temperature: 0.4  },
  interview_questions:  { model: "google/gemma-4-31b-it:free",                  temperature: 0.6  },
  interview_analyze:    { model: "openai/gpt-oss-120b:free",                    temperature: 0.3  },
  autofill:             { model: "google/gemma-4-26b-a4b-it:free",              temperature: 0.2  },
  skill_extract:        { model: "qwen/qwen3-coder:free",                       temperature: 0.0  },
  linkedin_post:        { model: "google/gemma-4-31b-it:free",                  temperature: 0.8  },
  career:               { model: "meta-llama/llama-3.3-70b-instruct:free",     temperature: 0.7  },
  discovery:            { model: "google/gemma-4-31b-it:free",                  temperature: 0.4  },
  reviews:              { model: "qwen/qwen3-coder:free",                       temperature: 0.2  },
  auto_apply:           { model: "google/gemma-4-26b-a4b-it:free",              temperature: 0.2  },
  company_brief:        { model: "google/gemma-4-31b-it:free",                  temperature: 0.4  },
  recruiter_match:      { model: "qwen/qwen3-next-80b-a3b-instruct:free",       temperature: 0.3  },
  recruiter_outreach:   { model: "google/gemma-4-31b-it:free",                  temperature: 0.7  },
  dashboard_summary:    { model: "google/gemma-4-31b-it:free",                  temperature: 0.4  },
  article_writer:       { model: "meta-llama/llama-3.3-70b-instruct:free",      temperature: 0.7  },
  job_parser:           { model: "qwen/qwen3-coder:free",                       temperature: 0.0  },
  resume_merge:         { model: "qwen/qwen3-coder:free",                       temperature: 0.2  },
  // Resume summary: recruiter-ready prose digest of a single resume. Same
  // narrative model family as dashboard_summary / company_brief, slightly
  // warmer so the output reads like a person and not a list of fields.
  resume_summary:       { model: "google/gemma-4-31b-it:free",                  temperature: 0.5  },
  // Consolidate highlights: short structured rewrite of a single section's
  // bullet list. Same model family as resume_optimize (structured JSON, low
  // hallucination), slightly warmer so the bullets read like a person.
  resume_consolidate_highlights: { model: "qwen/qwen3-coder:free",              temperature: 0.4, maxTokens: 1200 },
  studio_misc:          { model: "google/gemma-4-26b-a4b-it:free",              temperature: 0.5  },
  // Profile audit: structured JSON rewrite of the user's headline + summary.
  // Same shape as resume_optimize (ATS-style rewrite + rationale) so we share
  // the model. Slightly higher temp to give the headline some voice.
  profile_audit:        { model: "qwen/qwen3-coder:free",                       temperature: 0.4  },
  // Salary estimate: structured JSON output (median + percentiles + location
  // factor + skill premium array). Numbers must be deterministic-feeling
  // and tied to title × location × industry × experience — same model
  // family as resume_optimize / job_parser (low-temp JSON specialists).
  salary_estimate:      { model: "qwen/qwen3-coder:free",                       temperature: 0.2, maxTokens: 2000 },
  // Salary negotiation: narrative advice + talking points. Warmer model
  // family — same pick as recruiter_outreach / linkedin_post for "writes
  // like a person".
  salary_negotiation:   { model: "google/gemma-4-31b-it:free",                  temperature: 0.6, maxTokens: 1200 },
  default:              { model: "google/gemma-4-31b-it:free",                  temperature: 0.7  },
};

/**
 * Resolve the full profile for a use case. Centralised so the facade,
 * the SA admin endpoint, and any future telemetry all agree on what's
 * being sent to the LLM.
 */
export function resolveProfileForUseCase(useCase: LLMUseCase): UseCaseProfile {
  return USE_CASE_PROFILES[useCase] ?? USE_CASE_PROFILES.default;
}

/**
 * Flatten a use case into the ordered list of inference profiles the
 * facade should try in turn: `[primary, ...fallbacks]`. The first entry
 * is always the primary profile; subsequent entries are cross-provider
 * fallbacks. The facade walks this list, advancing only when a profile
 * exhausts its provider's INTERNAL model fallback chain too. Single
 * source of truth — the facade and the SA `/use-cases` endpoint both
 * read from this so what SA sees IS what runs.
 */
export function resolveProfileChainForUseCase(useCase: LLMUseCase): InferenceProfile[] {
  const profile = resolveProfileForUseCase(useCase);
  const { fallbacks, ...primary } = profile;
  return [primary, ...(fallbacks ?? [])];
}

/**
 * Pull the API key for a given provider out of the Cloudflare Worker env.
 * Returns undefined when not configured — callers fall through to the
 * mock / keyword-overlap path the same way they do for OpenRouter.
 */
export interface ProviderEnv {
  OPENROUTER_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  OLLAMA_API_KEY?: string;
}

/**
 * Pull the API key for a given provider out of the Cloudflare Worker
 * env. The env-var name is declared on the provider itself (its
 * `apiKeyEnvVar` field), so this function has no per-provider knowledge
 * — it just looks up the field the registry tells it to. Adding a new
 * vendor doesn't touch this function.
 */
export function getProviderApiKey(
  env: ProviderEnv | undefined,
  provider: ProviderId,
): string | undefined {
  const field = PROVIDERS[provider].apiKeyEnvVar;
  const raw =
    env?.[field] ??
    (globalThis as { __ENV?: ProviderEnv }).__ENV?.[field];
  return raw && raw.trim() ? raw.trim() : undefined;
}
