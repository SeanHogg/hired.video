/**
 * LLM provider registry — single source of truth for which vendors we
 * support, where their endpoints live, and which models each one serves.
 *
 * Adding a new OpenAI-compatible vendor (Together, Groq, DeepInfra, etc.)
 * is a one-entry change here plus exposing its API key on the `Env` type.
 * The actual HTTP call goes through `openai-compat.ts`, which is shared.
 *
 * Why a registry instead of one file per provider:
 *   - The wire format is identical (OpenAI chat-completions). Duplicating
 *     the fallback loop and fetch call per provider would violate DRY and
 *     drift over time (we already saw this between `callLLMWithUsage` and
 *     `callLLMWithMessagesAndUsage` in ai.ts).
 *   - Routing-by-model needs ONE table to consult; multiple files would
 *     mean walking a discovery API.
 */

export type ProviderId = "openrouter" | "cerebras";

export interface ProviderConfig {
  id: ProviderId;
  /** Human label for logs and the /api/ai/models endpoint. */
  label: string;
  /** Full chat-completions endpoint URL. */
  endpoint: string;
  /** Extra headers to send (auth header is added separately). */
  headers?: Record<string, string>;
  /** Default model when caller doesn't specify one. */
  defaultModel: string;
  /**
   * Models tried in order when the requested one fails. Keep these
   * provider-internal — we don't auto-hop across providers because that
   * silently changes pricing/quotas/expectations for the caller.
   */
  fallbackChain: readonly string[];
  /** Per-request timeout (ms). One slow vendor must not stall the chain. */
  timeoutMs: number;
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
    defaultModel: "google/gemma-4-31b-it:free",
    // Verified working on OpenRouter as of 2026-04-20 (user-validated).
    // Tried in order; first one that responds with valid JSON wins.
    fallbackChain: [
      "google/gemma-4-31b-it:free",
      "google/gemma-4-26b-a4b-it:free",
      "openrouter/elephant-alpha",
      "nousresearch/hermes-3-llama-3.1-405b:free",
      "tencent/hy3-preview:free",
      "openai/gpt-oss-120b:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "z-ai/glm-4.5-air:free",
      "qwen/qwen3-next-80b-a3b-instruct:free",
      "nvidia/nemotron-nano-9b-v2:free",
      "qwen/qwen3-coder:free",
    ],
    timeoutMs: 45_000,
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    // Cerebras exposes an OpenAI-compatible REST endpoint, so we use the
    // same fetch path as OpenRouter rather than pulling in their SDK
    // (which is Node-shaped and harder to ship on Cloudflare Workers).
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    defaultModel: "llama3.1-8b",
    // Production model first, preview model second. Cerebras has fewer
    // models than OpenRouter and we only fall back within the provider.
    fallbackChain: ["llama3.1-8b", "qwen-3-235b-a22b-instruct-2507"],
    // Cerebras inference is famously fast — give it a tighter timeout so
    // we don't sit on a hung request when we could be trying the next one.
    timeoutMs: 20_000,
  },
};

/**
 * Models we know about, mapped to the provider that serves them. Used by
 * `createLLMClient(env)` to auto-route a request based on the model field
 * in `LLMOptions`. If a model isn't listed, OpenRouter is assumed.
 *
 * Keep this in sync with `MODEL_CATALOG` in ai.ts — the catalog is what
 * the frontend sees; this map is what the router uses internally.
 */
export const MODEL_TO_PROVIDER: Record<string, ProviderId> = {
  // Cerebras
  "llama3.1-8b": "cerebras",
  "qwen-3-235b-a22b-instruct-2507": "cerebras",
};

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
  | "studio_misc"            // ancillary studio LLM calls (tags, captions, B-roll prompts)
  | "profile_audit"          // candidate profile audit + headline/summary rewrite (structured JSON)
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
  studio_misc:          { model: "google/gemma-4-26b-a4b-it:free",              temperature: 0.5  },
  // Profile audit: structured JSON rewrite of the user's headline + summary.
  // Same shape as resume_optimize (ATS-style rewrite + rationale) so we share
  // the model. Slightly higher temp to give the headline some voice.
  profile_audit:        { model: "qwen/qwen3-coder:free",                       temperature: 0.4  },
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
}

export function getProviderApiKey(
  env: ProviderEnv | undefined,
  provider: ProviderId,
): string | undefined {
  const raw =
    provider === "cerebras"
      ? env?.CEREBRAS_API_KEY ?? (globalThis as { __ENV?: ProviderEnv }).__ENV?.CEREBRAS_API_KEY
      : env?.OPENROUTER_API_KEY ?? (globalThis as { __ENV?: ProviderEnv }).__ENV?.OPENROUTER_API_KEY;
  return raw && raw.trim() ? raw.trim() : undefined;
}
