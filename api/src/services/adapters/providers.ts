/**
 * LLM use-case profile registry — the per-action mapping of model +
 * sampling profile + cross-vendor fallback chain.
 *
 * Single source of truth for product-level LLM decisions:
 *   - `studio_script` runs on Claude Haiku (best narrative + JSON), with
 *     a free OpenRouter fallback so Claude outage doesn't degrade Pro
 *     users below free.
 *   - `match` runs on Cerebras for sub-200ms TTFT, with an OpenRouter
 *     fallback when Cerebras is down.
 *   - Cheap small fields (autofill) ride on the smallest free Gemma.
 *   - Long-form narrative (resume_roast, articles, match_insights)
 *     leans on Hermes 3 / Llama 3.3.
 *
 * The Builderforce gateway (consumed via `@seanhogg/builderforce-sdk`
 * in llm-client.ts) is the single transport for every model; vendor
 * identity is signalled by the model string (`openrouter/...`,
 * `cerebras/...`, `ollama/...`). Per the gateway docs, model is a
 * HINT not a hard pin — see gap #515 for the latency-contract risk on
 * `match` (Cerebras-only).
 *
 * Visible to SA via `GET /api/admin/impersonate/ai/use-cases`. End
 * users (free or paid) never see these values.
 */

/**
 * Use cases — the only thing route code passes to the facade. Adding
 * a use case is a one-entry edit to USE_CASE_PROFILES below; the
 * gateway's `useCase` field is opaque telemetry (per SDK 0.4.0) so the
 * taxonomy is entirely ours.
 */
export type LLMUseCase =
  | "studio_script"
  | "studio_edit_script"
  | "chat"
  | "resume_roast"
  | "resume_optimize"
  | "match"
  | "match_tailor"
  | "match_insights"
  | "interview_questions"
  | "interview_analyze"
  | "autofill"
  | "skill_extract"
  | "linkedin_post"
  | "career"
  | "discovery"
  | "reviews"
  | "auto_apply"
  | "company_brief"
  | "recruiter_match"
  | "recruiter_outreach"
  | "dashboard_summary"
  | "article_writer"
  | "job_parser"
  | "resume_merge"
  | "resume_summary"
  | "resume_consolidate_highlights"
  | "studio_misc"
  | "profile_audit"
  | "career_360"
  | "salary_estimate"
  | "salary_negotiation"
  | "vendor_extract"
  | "email_classify"
  | "email_summary"
  | "email_digest"
  | "default";

/** A leaf inference profile — model + sampling, no further fallbacks. */
export interface InferenceProfile {
  /** Vendor-prefixed model id understood by the Builderforce gateway.
   *  `openrouter/...`, `cerebras/...`, `ollama/...` route to the named
   *  vendor; bare ids fall back to gateway catalog lookup. */
  model: string;
  temperature: number;
  maxTokens?: number;
}

export interface UseCaseProfile extends InferenceProfile {
  /**
   * Cross-provider fallback chain. The dispatch loop in llm-client.ts
   * tries the primary first, then walks this list on failure. Each
   * entry is one independent gateway request.
   *
   * The Builderforce gateway also has its own internal failover
   * (surfaced via `_builderforce.retries`). Our chain runs on top of
   * that: gateway exhausts its candidates → returns failure → we
   * advance to the next profile here. Use sparingly; falling back
   * from Cerebras to OpenRouter for `match` is a 10-50× latency hit
   * the user will notice.
   */
  fallbacks?: InferenceProfile[];
}

/** Stable free-tier safety net auto-appended to every use case's
 *  fallback chain. Ordered most-to-least JSON-friendly so structured
 *  callers (tailor, classify, parse) get the best vendor early without
 *  any caller having to opt in. When a model rotates (deprecated /
 *  removed from the free pool), change it here and every use case
 *  picks it up — no scattered config edits. */
const FREE_TIER_FALLBACK_POOL = [
  "qwen/qwen3-coder:free",
  "google/gemma-4-31b-it:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
] as const;

/** Auto-pad a use-case profile with the shared free-tier fallback pool
 *  so a single-model 429 can never 503 the whole feature. Caller-supplied
 *  fallbacks take precedence (paid → caller's free choice → pool); the
 *  primary's `temperature` and `maxTokens` apply to every appended pool
 *  entry so generation parameters stay coherent across the chain. We
 *  de-dupe by model id so primary/explicit fallbacks aren't dispatched
 *  to twice. */
function withFreeTierFallbacks(profile: UseCaseProfile): UseCaseProfile {
  const explicit = profile.fallbacks ?? [];
  const seen = new Set<string>([profile.model, ...explicit.map((f) => f.model)]);
  const padded: InferenceProfile[] = FREE_TIER_FALLBACK_POOL
    .filter((m) => !seen.has(m))
    .map((model) => ({
      model,
      temperature: profile.temperature,
      ...(profile.maxTokens !== undefined ? { maxTokens: profile.maxTokens } : {}),
    }));
  return { ...profile, fallbacks: [...explicit, ...padded] };
}

const RAW_USE_CASE_PROFILES: Record<LLMUseCase, UseCaseProfile> = {
  studio_script: {
    model: "anthropic/claude-3-haiku",
    temperature: 0.7,
    fallbacks: [
      { model: "qwen/qwen3-next-80b-a3b-instruct:free", temperature: 0.7 },
    ],
  },
  studio_edit_script: { model: "google/gemma-4-31b-it:free", temperature: 0.4 },
  chat: { model: "meta-llama/llama-3.3-70b-instruct:free", temperature: 0.7 },
  resume_roast: { model: "nousresearch/hermes-3-llama-3.1-405b:free", temperature: 0.85 },
  resume_optimize: { model: "qwen/qwen3-coder:free", temperature: 0.3 },
  match: {
    model: "cerebras/llama3.1-8b",
    temperature: 0.2,
    fallbacks: [
      { model: "qwen/qwen3-coder:free", temperature: 0.2 },
    ],
  },
  match_tailor: { model: "qwen/qwen3-next-80b-a3b-instruct:free", temperature: 0.4 },
  match_insights: { model: "nousresearch/hermes-3-llama-3.1-405b:free", temperature: 0.4 },
  interview_questions: { model: "google/gemma-4-31b-it:free", temperature: 0.6 },
  interview_analyze: { model: "openai/gpt-oss-120b:free", temperature: 0.3 },
  autofill: { model: "google/gemma-4-26b-a4b-it:free", temperature: 0.2 },
  skill_extract: { model: "qwen/qwen3-coder:free", temperature: 0.0 },
  linkedin_post: { model: "google/gemma-4-31b-it:free", temperature: 0.8 },
  career: { model: "meta-llama/llama-3.3-70b-instruct:free", temperature: 0.7 },
  discovery: { model: "google/gemma-4-31b-it:free", temperature: 0.4 },
  reviews: { model: "qwen/qwen3-coder:free", temperature: 0.2 },
  auto_apply: { model: "google/gemma-4-26b-a4b-it:free", temperature: 0.2 },
  company_brief: { model: "google/gemma-4-31b-it:free", temperature: 0.4 },
  recruiter_match: { model: "qwen/qwen3-next-80b-a3b-instruct:free", temperature: 0.3 },
  recruiter_outreach: { model: "google/gemma-4-31b-it:free", temperature: 0.7 },
  dashboard_summary: { model: "google/gemma-4-31b-it:free", temperature: 0.4 },
  article_writer: { model: "meta-llama/llama-3.3-70b-instruct:free", temperature: 0.7 },
  job_parser: { model: "qwen/qwen3-coder:free", temperature: 0.0 },
  resume_merge: { model: "qwen/qwen3-coder:free", temperature: 0.2 },
  resume_summary: { model: "google/gemma-4-31b-it:free", temperature: 0.5 },
  resume_consolidate_highlights: { model: "qwen/qwen3-coder:free", temperature: 0.4, maxTokens: 1200 },
  studio_misc: { model: "google/gemma-4-26b-a4b-it:free", temperature: 0.5 },
  profile_audit: { model: "qwen/qwen3-coder:free", temperature: 0.4 },
  career_360: {
    model: "qwen/qwen3-coder:free",
    temperature: 0.4,
    maxTokens: 4000,
    fallbacks: [
      { model: "qwen/qwen3-next-80b-a3b-instruct:free", temperature: 0.4, maxTokens: 4000 },
    ],
  },
  salary_estimate: { model: "qwen/qwen3-coder:free", temperature: 0.2, maxTokens: 2000 },
  salary_negotiation: { model: "google/gemma-4-31b-it:free", temperature: 0.6, maxTokens: 1200 },
  vendor_extract: { model: "qwen/qwen3-coder:free", temperature: 0.0, maxTokens: 4000 },
  // Inbox email pipeline (Stage-2 classifier, per-message summary,
  // sync-batch digest). All three lean cheap + fast — Gemma 4 covers
  // the volume profile (full-mailbox sync); the rest of the JSON-strict
  // safety net (qwen3-coder etc.) is auto-appended by
  // withFreeTierFallbacks below (closes gap #527 + #530 + #550).
  email_classify: {
    model: "google/gemma-4-26b-a4b-it:free",
    temperature: 0.1,
    maxTokens: 400,
  },
  email_summary: { model: "google/gemma-4-26b-a4b-it:free", temperature: 0.3, maxTokens: 220 },
  email_digest: { model: "google/gemma-4-31b-it:free", temperature: 0.4, maxTokens: 600 },
  default: { model: "google/gemma-4-31b-it:free", temperature: 0.7 },
};

export const USE_CASE_PROFILES: Record<LLMUseCase, UseCaseProfile> = Object.fromEntries(
  (Object.entries(RAW_USE_CASE_PROFILES) as [LLMUseCase, UseCaseProfile][]).map(
    ([useCase, profile]) => [useCase, withFreeTierFallbacks(profile)],
  ),
) as Record<LLMUseCase, UseCaseProfile>;

/** Resolve the full profile for a use case. Centralised so the facade,
 *  the SA admin endpoint, and any future telemetry all agree on what's
 *  being sent to the gateway. */
export function resolveProfileForUseCase(useCase: LLMUseCase): UseCaseProfile {
  return USE_CASE_PROFILES[useCase] ?? USE_CASE_PROFILES.default;
}

/** Flatten a use case into the ordered list of inference profiles the
 *  facade should try in turn: `[primary, ...fallbacks]`. */
export function resolveProfileChainForUseCase(useCase: LLMUseCase): InferenceProfile[] {
  const profile = resolveProfileForUseCase(useCase);
  const { fallbacks, ...primary } = profile;
  return [primary, ...(fallbacks ?? [])];
}
