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
 * Every chain is auto-padded by `withFallbackChain` below:
 *   1. Caller-supplied explicit fallbacks (paid + caller's free choice)
 *   2. Shared `FREE_TIER_FALLBACK_POOL` (qwen3-coder / gemma / hermes)
 *   3. `PAID_TERMINAL_POOL` (cerebras/llama3.1-8b → anthropic Haiku) —
 *      only for use cases in `INTERACTIVE_USE_CASES`. Restores
 *      cross-vendor diversity at the paid layer too, so neither an
 *      OpenRouter free-pool outage nor a single-paid-vendor 429 can
 *      503 user-facing features (closes gap #525 Part B, widened by
 *      #888 after Cerebras itself returned 429).
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
  | "interview_answer_score"
  | "video_pitch_script"
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
  | "inbox_draft_jd"
  | "scorecard_bias_check"
  | "article_moderation"
  | "course_generation"
  | "course_recommend"
  // 3D world game-builder agent (gap #1638). Multi-turn tool-using
  // agent that calls the world-3d mutation tools to build the game
  // from natural-language prompts. Needs a model with strong tool-use
  // + reasoning; defaults to anthropic/claude-sonnet-4-6 which the
  // gateway resolves to the latest tool-calling-capable variant.
  | "studio_game_agent"
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

/** Paid-tier terminal fallback pool for user-interactive use cases.
 *  Cerebras Llama 3.1-8B (sub-200ms TTFT, cheap) is the fast path;
 *  Anthropic Claude Haiku 4.5 (already `studio_script`'s primary) is the
 *  second vendor so the paid layer has the same cross-vendor diversity
 *  we already give the free layer. Closes gap #525 Part B; widened
 *  2026-05-21 (gap #888) after a tailor 503 (`correlationId
 *  llm-4c95a353`) showed Cerebras itself can return 429 in <1s — a
 *  single-vendor paid terminal is one outage away from useless. Ordered
 *  cheapest-fastest first so the common-case cost stays low; Haiku only
 *  kicks in when Cerebras itself rejects. Real $ on both; applied only
 *  to the use cases in INTERACTIVE_USE_CASES below. */
const PAID_TERMINAL_POOL = [
  "cerebras/llama3.1-8b",
  "anthropic/claude-haiku-4-5",
] as const;

/** A `:free`-tier model string (OpenRouter free pool). Single predicate so
 *  the dispatch-timeout policy (llm-client.ts) and the free-attempt cap below
 *  agree on what "free" means. */
const isFreeModel = (model: string): boolean => model.endsWith(":free");

/** Max `:free` models a user-blocking interactive flow will try before the
 *  paid terminal. Bounds worst-case free-pool-congestion wall-clock (each free
 *  attempt can burn the 25s per-attempt cap in llm-client.ts) — see #1939. */
const MAX_FREE_ATTEMPTS_INTERACTIVE = 2;

/** Use cases that should never bottom out at the free pool — when every
 *  free model fails, eat the paid call rather than 503 the user.
 *  Originally gap #525 Part B's list (8 entries); widened on 2026-05-20
 *  to include `match_tailor`, `interview_questions`, `interview_analyze`
 *  after a tailor 503 reproduced the same 4-attempt all-free-tier
 *  failure pattern (correlationId llm-a87dce60). These three are
 *  user-blocking foreground flows (resume tailoring, interview prep)
 *  where the user clicks and waits — same shape as the original 8.
 *  Excluded: low-interactivity / high-volume pipelines (autofill,
 *  email_*, vendor_extract, etc.) where a deterministic 503 + retry on
 *  next tick is fine and a paid call per item would explode cost.
 *  `job_parser` was added on 2026-05-20: a single Track click is the
 *  user-blocking gate to every downstream job-aware feature (match,
 *  tailor, autofill), and the free chain was producing unusable
 *  extracts often enough that users complained — promoting it to a
 *  premium primary + paid terminal is worth the per-click cost. */
export const INTERACTIVE_USE_CASES: ReadonlySet<LLMUseCase> = new Set<LLMUseCase>([
  "career_360",
  "chat",
  "interview_analyze",
  "interview_questions",
  "job_parser",
  "match",
  "match_insights",
  "match_tailor",
  "profile_audit",
  "resume_optimize",
  "resume_roast",
  "studio_game_agent",
  "studio_script",
]);

/** Auto-pad a use-case profile so a single-model 429 can never 503 the
 *  whole feature. Layered chain: caller-supplied fallbacks (paid +
 *  caller's free choice) → shared free-tier pool → paid terminal for
 *  interactive use cases. The primary's `temperature` and `maxTokens`
 *  apply to every appended entry so generation parameters stay coherent
 *  across the chain. We de-dupe by model id so a model that already
 *  appears upstream isn't dispatched to twice (so e.g. `match`'s
 *  Cerebras primary doesn't get re-added as the terminal). */
function withFallbackChain(useCase: LLMUseCase, profile: UseCaseProfile): UseCaseProfile {
  const explicit = profile.fallbacks ?? [];
  const seen = new Set<string>([profile.model, ...explicit.map((f) => f.model)]);
  const cloneForChain = (model: string): InferenceProfile => ({
    model,
    temperature: profile.temperature,
    ...(profile.maxTokens !== undefined ? { maxTokens: profile.maxTokens } : {}),
  });
  const freePool = FREE_TIER_FALLBACK_POOL
    .filter((m) => !seen.has(m))
    .map(cloneForChain);
  freePool.forEach((p) => seen.add(p.model));
  const interactive = INTERACTIVE_USE_CASES.has(useCase);
  const paidTerminal = interactive
    ? PAID_TERMINAL_POOL.filter((m) => !seen.has(m)).map(cloneForChain)
    : [];
  paidTerminal.forEach((p) => seen.add(p.model));

  let chain = [...explicit, ...freePool, ...paidTerminal];

  // #1939 — cap the number of `:free` models a user-blocking flow will walk
  // before reaching the paid terminal. When the OpenRouter free pool is
  // congested every free attempt burns the full 25s per-attempt cap
  // (correlationId llm-71b468dd: 4 free timeouts ≈ 100s before the paid
  // terminal was even tried). Keep at most MAX_FREE_ATTEMPTS_INTERACTIVE free
  // models across the WHOLE flattened chain (primary + fallbacks), preserving
  // order; paid entries are always kept so the cross-vendor safety net
  // survives the cap. Non-interactive / high-volume pipelines keep the full
  // free pool — a deterministic 503 + retry-next-tick is cheaper there than a
  // paid call per item.
  if (interactive) {
    let freeKept = isFreeModel(profile.model) ? 1 : 0;
    chain = chain.filter((p) => {
      if (!isFreeModel(p.model)) return true;
      if (freeKept >= MAX_FREE_ATTEMPTS_INTERACTIVE) return false;
      freeKept += 1;
      return true;
    });
  }

  return { ...profile, fallbacks: chain };
}

const RAW_USE_CASE_PROFILES: Record<LLMUseCase, UseCaseProfile> = {
  studio_script: {
    model: "anthropic/claude-haiku-4-5",
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
  interview_answer_score: { model: "openai/gpt-oss-120b:free", temperature: 0.2 },
  video_pitch_script: { model: "anthropic/claude-haiku-4-5", temperature: 0.7 },
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
  studio_game_agent: {
    // Tool-use intensive — needs a model that reliably emits structured
    // function calls. Sonnet is the default; the gateway will substitute
    // on cooldown / outage and the route surfaces resolvedModel.
    model: "anthropic/claude-sonnet-4-6",
    temperature: 0.4,
    maxTokens: 4096,
    fallbacks: [
      { model: "openai/gpt-4o-mini", temperature: 0.4 },
    ],
  },
  // Job extraction (Chrome extension Track click → /api/jobs/extract).
  // One-shot, user-initiated, high-value: a bad extract makes the saved
  // job unusable downstream (match scoring, tailor, autofill all read
  // this row). Match `studio_script`'s premium shape — Claude Haiku for
  // best JSON-from-markdown quality, free Qwen primary fallback, and
  // withFallbackChain auto-pads the rest of the free pool.
  job_parser: {
    model: "anthropic/claude-haiku-4-5",
    temperature: 0.0,
    fallbacks: [
      { model: "qwen/qwen3-next-80b-a3b-instruct:free", temperature: 0.0 },
    ],
  },
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
  // L2 inbox action: draft a tailored JD from recruiter intake notes
  // (#1982). A bit more headroom + a touch more temperature than the
  // classify path since this generates prose, not a strict label.
  inbox_draft_jd: { model: "google/gemma-4-31b-it:free", temperature: 0.5, maxTokens: 900 },
  // Scorecard bias linter (#1385). Short input + strict JSON output; the
  // gemma 4 instruct family hits the sweet spot of cheap + structured.
  article_moderation: { model: "openai/gpt-oss-120b:free", temperature: 0.2 },
  course_generation: { model: "anthropic/claude-haiku-4-5", temperature: 0.5 },
  // Re-rank a small keyword-recall candidate set against a learner's goal
  // (#1926). Tiny structured output (ordered ids) — cheap haiku, low temp.
  course_recommend: { model: "anthropic/claude-haiku-4-5", temperature: 0.2, maxTokens: 300 },
  scorecard_bias_check: {
    model: "google/gemma-4-26b-a4b-it:free",
    temperature: 0.1,
    maxTokens: 600,
  },
  default: { model: "google/gemma-4-31b-it:free", temperature: 0.7 },
};

export const USE_CASE_PROFILES: Record<LLMUseCase, UseCaseProfile> = Object.fromEntries(
  (Object.entries(RAW_USE_CASE_PROFILES) as [LLMUseCase, UseCaseProfile][]).map(
    ([useCase, profile]) => [useCase, withFallbackChain(useCase, profile)],
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
