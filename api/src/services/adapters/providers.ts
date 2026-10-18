/**
 * LLM use-case profile registry — the per-action mapping of model +
 * sampling profile + cross-vendor fallback chain.
 *
 * Single source of truth for product-level LLM decisions:
 *   - `studio_script` runs on Claude Opus 5.5 (best narrative + JSON), with
 *     a free OpenRouter fallback so a Claude outage doesn't degrade Pro
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
 *   3. `PAID_TERMINAL_POOL` (cerebras/llama3.1-8b → Claude Sonnet 5.5) —
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
 * Visible to SA via `GET /api/admin/sa/ai/use-cases`. End
 * users (free or paid) never see these values.
 */

import { CLAUDE_OPUS, CLAUDE_SONNET } from "./model-request-rules.js";

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
  // Help-first deflection in the AI Brain — a cheap, grounded answer
  // written ONLY from the bundled help docs the client supplies, or the
  // escalate sentinel when the docs don't cover the question. Free-pool +
  // low temp (factual, not creative). See POST /api/ai/help-assist.
  | "help_assist"
  | "resume_roast"
  | "resume_optimize"
  | "match"
  | "match_tailor"
  | "cover_letter"
  | "match_insights"
  | "interview_questions"
  | "interview_analyze"
  | "interview_answer_score"
  | "video_pitch_script"
  | "autofill"
  | "skill_extract"
  | "linkedin_post"
  // AI posting agent captions (#2300). Own profile so SuperAdmin can
  // meter agent spend separately from the LinkedIn share composer.
  | "posting_agent"
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
  // Resume image OCR (#gap — mobile photo/scan upload). VISION use case:
  // the user message carries an `image_url` content block, so the model
  // MUST be vision-capable. Keep it OUT of INTERACTIVE_USE_CASES — the
  // paid terminal pool (cerebras/anthropic-haiku) is text-only and would
  // be useless here; the route guards on empty OCR output instead.
  | "resume_ocr"
  | "studio_misc"
  | "profile_audit"
  // One-shot "improve this text with AI" for short profile fields — the
  // headline/tagline and the About bio on /people/:id. User-initiated,
  // user-blocking (they click ✨ and wait), prose rewrite. Interactive
  // so it never bottoms out at the congested free pool.
  | "profile_text_improve"
  | "career_360"
  | "salary_estimate"
  | "salary_negotiation"
  // Value Proposition tool — a tailored "why me for this role" pitch from
  // a résumé + job (+ optional company context). User-blocking; interactive.
  | "value_proposition"
  | "vendor_extract"
  | "email_classify"
  | "email_summary"
  | "email_digest"
  | "inbox_draft_jd"
  | "scorecard_bias_check"
  | "article_moderation"
  | "promotion_screening"
  // Explicit-content scan (moderation/explicit): text = strict-JSON policy
  // classifier; image = VISION (message carries image_url blocks — the
  // adapter rejects answers from a non-vision model in the padded chain).
  | "explicit_text_scan"
  | "explicit_image_scan"
  | "course_generation"
  | "course_recommend"
  // 3D world game-builder agent (gap #1638). Multi-turn tool-using
  // agent that calls the world-3d mutation tools to build the game
  // from natural-language prompts. Needs a model with strong tool-use
  // + reasoning; defaults to Claude Opus 5.5 (CLAUDE_OPUS), strict-pinned.
  | "studio_game_agent"
  | "default";

/** A leaf inference profile — model + sampling, no further fallbacks. */
export interface InferenceProfile {
  /** Vendor-prefixed model id understood by the Builderforce gateway.
   *  `openrouter/...`, `cerebras/...`, `ollama/...` route to the named
   *  vendor; bare `claude-*` ids go to the gateway's own Anthropic account.
   *  Per-family wire rules (strict pin, sampling, thinking budget) are
   *  applied by model-request-rules.ts, not here. */
  model: string;
  /** Ignored for families that reject sampling params (Claude 5.x). */
  temperature: number;
  /** Raised to the family's thinking floor where one applies. */
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
 *  Anthropic Claude Sonnet 5.5 is the
 *  second vendor so the paid layer has the same cross-vendor diversity
 *  we already give the free layer. Closes gap #525 Part B; widened
 *  2026-05-21 (gap #888) after a tailor 503 (`correlationId
 *  llm-4c95a353`) showed Cerebras itself can return 429 in <1s — a
 *  single-vendor paid terminal is one outage away from useless. Ordered
 *  cheapest-fastest first so the common-case cost stays low; Claude only
 *  kicks in when Cerebras itself rejects. Real $ on both; applied only
 *  to the use cases in INTERACTIVE_USE_CASES below. The Anthropic entry is
 *  the direct Sonnet 5.5 id — a safety net, so the cheaper Claude (≈5× under
 *  Opus 5.5). Was `anthropic/claude-opus-5-5`, an id that never existed, so
 *  the gateway silently cascaded to other models (2026-10-04). Family wire
 *  rules: model-request-rules.ts. */
const PAID_TERMINAL_POOL = [
  "cerebras/llama3.1-8b",
  CLAUDE_SONNET,
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
  "cover_letter",
  "profile_audit",
  "profile_text_improve",
  "resume_optimize",
  "resume_roast",
  "studio_game_agent",
  "studio_script",
  "value_proposition",
]);

/** Use cases whose messages carry `image_url` blocks, so every model in the
 *  chain must be vision-capable. They get no text-only free-pool padding
 *  (#2230). Not interactive either: the paid terminal pool has a text-only
 *  Cerebras leg. */
export const VISION_USE_CASES: ReadonlySet<LLMUseCase> = new Set<LLMUseCase>(["resume_ocr", "explicit_image_scan"]);

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
  // The shared free pool is text-only: a vision use case can't use it (#2230),
  // so its chain is exactly the vision models it lists.
  const freePool = VISION_USE_CASES.has(useCase)
    ? []
    : FREE_TIER_FALLBACK_POOL.filter((m) => !seen.has(m)).map(cloneForChain);
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
    model: CLAUDE_OPUS,
    temperature: 0.7,
    fallbacks: [
      { model: "qwen/qwen3-next-80b-a3b-instruct:free", temperature: 0.7 },
    ],
  },
  studio_edit_script: { model: "google/gemma-4-31b-it:free", temperature: 0.4 },
  chat: { model: "meta-llama/llama-3.3-70b-instruct:free", temperature: 0.7 },
  // Help deflection: grounded extraction from supplied docs. Low temp so it
  // sticks to the source and reliably emits the escalate sentinel on a miss.
  help_assist: { model: "meta-llama/llama-3.3-70b-instruct:free", temperature: 0.2 },
  resume_roast: { model: "nousresearch/hermes-3-llama-3.1-405b:free", temperature: 0.85 },
  // Résumé parse / revise / rewrite echo the WHOLE résumé as JSON — the same
  // failure shape as match_tailor below: a free primary with no maxTokens
  // truncates the echo (invalid JSON → chain advances) and the paid terminal
  // 400s without max_tokens, so /api/resumes/revise 503'd (REVISE_FAILED) and
  // uploads came back with work[] dropped. Reliable JSON-capable primary +
  // explicit maxTokens; a free model stays as the first fallback.
  resume_optimize: {
    model: CLAUDE_OPUS,
    temperature: 0.3,
    maxTokens: 8000,
    // Sonnet first: same direct Anthropic account, echoes a whole résumé
    // reliably. The old `qwen/qwen3-next-80b-a3b-instruct:free` is not
    // served — the gateway silently answers with googleai/gemini-2.5-flash
    // (500 when strictly pinned; probed 2026-10-08), so an Opus blip handed
    // the scorer + revise to a substitute that truncates the résumé echo.
    fallbacks: [{ model: CLAUDE_SONNET, temperature: 0.3, maxTokens: 8000 }],
  },
  match: {
    model: "cerebras/llama3.1-8b",
    temperature: 0.2,
    fallbacks: [
      { model: "qwen/qwen3-coder:free", temperature: 0.2 },
    ],
  },
  // Resume tailoring emits the LARGEST JSON of any use case — the full
  // tailored `ResumeContent` document PLUS a justified `changes[]` list and a
  // summary. The previous profile (free-tier primary, NO maxTokens) made this
  // flow fail systematically, not occasionally:
  //   1. NO maxTokens → the gateway sent no `max_tokens`. Free/8B models
  //      default to a small completion cap and TRUNCATE the full-resume echo
  //      → invalid JSON → parse throw → chain advances. Worse, the paid
  //      terminal (Claude) REQUIRES `max_tokens`; an unset
  //      value makes that attempt 400, so even the last-resort model couldn't
  //      rescue the call → the whole chain exhausted with no result.
  //   2. Free-tier primary → the common case depended on a congested free pool
  //      that 429s / times out (each free attempt burns the 25s per-attempt
  //      cap), and small models (cerebras llama3.1-8b) drop work/education
  //      entries → `validateTailorOutput` fails → 400 after the single retry.
  // This is a one-shot, user-blocking, high-value flow (same shape as
  // job_parser / resume_ocr), so it now gets a reliable JSON-capable paid
  // primary with a generous, explicit maxTokens (a large resume + changes +
  // summary fits well under 8000). A free model stays as the cost-saving first
  // fallback. The remaining structural win — switch to a diff-only output
  // contract so the model never re-emits the untouched document — is tracked
  // in gap #2109.
  match_tailor: {
    model: CLAUDE_OPUS,
    temperature: 0.3,
    maxTokens: 8000,
    fallbacks: [
      { model: "qwen/qwen3-next-80b-a3b-instruct:free", temperature: 0.3, maxTokens: 8000 },
    ],
  },
  // The letter that goes with a tailored résumé — one-shot, user-facing
  // prose written from the tailored JSON; same reliable primary as the
  // tailor it follows, warmer temperature for the writing.
  cover_letter: {
    model: CLAUDE_OPUS,
    temperature: 0.5,
    maxTokens: 3000,
    fallbacks: [{ model: "qwen/qwen3-next-80b-a3b-instruct:free", temperature: 0.5, maxTokens: 3000 }],
  },
  match_insights: { model: "nousresearch/hermes-3-llama-3.1-405b:free", temperature: 0.4 },
  interview_questions: { model: "google/gemma-4-31b-it:free", temperature: 0.6 },
  interview_analyze: { model: "openai/gpt-oss-120b:free", temperature: 0.3 },
  interview_answer_score: { model: "openai/gpt-oss-120b:free", temperature: 0.2 },
  video_pitch_script: { model: CLAUDE_OPUS, temperature: 0.7 },
  autofill: { model: "google/gemma-4-26b-a4b-it:free", temperature: 0.2 },
  skill_extract: { model: "qwen/qwen3-coder:free", temperature: 0.0 },
  linkedin_post: { model: "google/gemma-4-31b-it:free", temperature: 0.8 },
  posting_agent: { model: "google/gemma-4-31b-it:free", temperature: 0.8 },
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
    // function calls. Opus 5.5 is the default (was claude-sonnet-4-6 +
    // an openai/gpt-4o-mini fallback; both retired out of the gateway
    // catalog on 2026-06-21, gap #1938). No explicit fallback now: this
    // use case is interactive, so withFallbackChain auto-pads the free
    // pool + the cross-vendor PAID_TERMINAL_POOL (cerebras → opus,
    // deduped) — the same safety net every other interactive flow gets,
    // and the route still surfaces resolvedModel on substitution.
    model: CLAUDE_OPUS,
    temperature: 0.4,
    maxTokens: 4096,
  },
  // Job extraction (Chrome extension Track click → /api/jobs/extract).
  // One-shot, user-initiated, high-value: a bad extract makes the saved
  // job unusable downstream (match scoring, tailor, autofill all read
  // this row). Match `studio_script`'s premium shape — Claude Opus 5.5 for
  // best JSON-from-markdown quality, free Qwen primary fallback, and
  // withFallbackChain auto-pads the rest of the free pool.
  job_parser: {
    model: CLAUDE_OPUS,
    temperature: 0.0,
    fallbacks: [
      { model: "qwen/qwen3-next-80b-a3b-instruct:free", temperature: 0.0 },
    ],
  },
  resume_merge: { model: "qwen/qwen3-coder:free", temperature: 0.2 },
  // Vision OCR for resume images (phone photos / scans). VISION use case —
  // the message carries an image_url block, so the model MUST be
  // vision-capable. Claude Opus 5.5 is a reliable vision model and the
  // primary so OCR quality is good on the one-shot, user-initiated upload.
  // temp 0 — transcription, not generation. (Was openai/gpt-4o-mini primary +
  // a meta-llama/llama-3.2-11b-vision-instruct:free fallback; both retired out
  // of the gateway catalog on 2026-06-21, gap #1938.)
  // Free vision fallbacks (#2233), verified 2026-10-10 against the live
  // gateway catalog (`sdk.models.list()`, `capabilities: ["vision"]`):
  //   • meta/llama-3.2-11b-vision-instruct — NVIDIA-served, free; a strict
  //     probe with an image block answered correctly.
  //   • google/gemma-4-26b-a4b-it:free — OpenRouter free, listed with vision
  //     (was on cooldown at probe time, so it is the second leg).
  // VISION_USE_CASES keeps the text-only free pool out of this chain; if every
  // vision leg fails the routes return a clear 422 (they guard empty OCR).
  resume_ocr: {
    model: CLAUDE_OPUS,
    temperature: 0.0,
    maxTokens: 4000,
    fallbacks: [
      { model: "meta/llama-3.2-11b-vision-instruct", temperature: 0.0, maxTokens: 4000 },
      { model: "google/gemma-4-26b-a4b-it:free", temperature: 0.0, maxTokens: 4000 },
    ],
  },
  resume_summary: { model: "google/gemma-4-31b-it:free", temperature: 0.5 },
  resume_consolidate_highlights: { model: "qwen/qwen3-coder:free", temperature: 0.4, maxTokens: 1200 },
  studio_misc: { model: "google/gemma-4-26b-a4b-it:free", temperature: 0.5 },
  profile_audit: { model: "qwen/qwen3-coder:free", temperature: 0.4 },
  // Short prose rewrite (headline ~1 line / About ≤2000 chars). A touch
  // of temperature for punchier phrasing; interactive so withFallbackChain
  // pads the paid terminal pool behind the free primary.
  profile_text_improve: { model: "google/gemma-4-31b-it:free", temperature: 0.6, maxTokens: 900 },
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
  // Persuasive but grounded prose in a small JSON envelope (~6 fields).
  value_proposition: { model: "google/gemma-4-31b-it:free", temperature: 0.6, maxTokens: 1500 },
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
  // Promotion queue pre-screen (#2046) — same strict-JSON policy classifier
  // shape as article moderation; a human still reviews everything it passes.
  promotion_screening: { model: "openai/gpt-oss-120b:free", temperature: 0.1 },
  // Explicit scan (owner decision 2026-10-10) — gates the public home wall.
  // Text: same strict-JSON classifier shape as promotion screening. Image:
  // Claude Sonnet 5.5 vision (≈5× cheaper than Opus; frames are batched into
  // one call). The free text pool withFallbackChain appends can't see images,
  // so the vision adapter ignores answers whose resolved model isn't
  // vision-capable (→ unscreened, which fails closed for public reach).
  explicit_text_scan: { model: "openai/gpt-oss-120b:free", temperature: 0.0, maxTokens: 300 },
  explicit_image_scan: { model: CLAUDE_SONNET, temperature: 0.0, maxTokens: 300 },
  course_generation: { model: CLAUDE_OPUS, temperature: 0.5 },
  // Re-rank a small keyword-recall candidate set against a learner's goal
  // (#1926). Tiny structured output (ordered ids) — Claude, low temp.
  course_recommend: { model: CLAUDE_OPUS, temperature: 0.2, maxTokens: 300 },
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

// ── Feature-key → use-case registry (#457) ───────────────────────────────────
//
// `ai_usage_records.feature_key` is the per-call billing dimension, but it's
// finer-grained than the use-case profile that selected the model (e.g.
// `career_360_suggest` / `career_360_plan` / `career_360_evaluate` all run on
// the one `career_360` profile). This registry is the single source of truth
// for which feature keys roll up to which use case, so SuperAdmin can attribute
// spend per use case at a glance instead of eyeballing 65 raw feature keys.
//
// Derived from the actual `client.callX(featureKey, { useCase })` call sites —
// keep it in sync when adding a new AI call (the SA `/use-cases` row for that
// use case lists the key once registered). The record's value type forces every
// entry to be a real `LLMUseCase`.
export const FEATURE_KEY_USE_CASE: Record<string, LLMUseCase> = {
  assessment_grading: "reviews",
  auto_apply_match: "match",
  auto_apply_tailor: "auto_apply",
  autofill_analyze_form: "autofill",
  autofill_analyze_questions: "autofill",
  autofill_generate_answers: "autofill",
  career_360_evaluate: "career_360",
  career_360_plan: "career_360",
  career_360_suggest: "career_360",
  career_copilot: "career",
  career_resilience: "career",
  chat: "chat",
  comic_scaffold: "studio_script",
  company_extract_brief: "company_brief",
  content_safety_scan: "reviews",
  course_recommend: "course_recommend",
  dashboard_insights: "dashboard_summary",
  discovery_career_guide: "discovery",
  email_classify: "email_classify",
  email_summary: "email_summary",
  explicit_image_scan: "explicit_image_scan",
  explicit_text_scan: "explicit_text_scan",
  inbox_draft_jd: "inbox_draft_jd",
  interview_analyze: "interview_analyze",
  interview_answer_score: "interview_answer_score",
  interview_questions: "interview_questions",
  linkedin_post_gen: "linkedin_post",
  posting_agent_caption: "posting_agent",
  profile_headline_improve: "profile_text_improve",
  profile_about_improve: "profile_text_improve",
  match_analyze: "match",
  match_bycontent: "match",
  match_byid: "match",
  match_insights: "match_insights",
  match_tailor: "match_tailor",
  cover_letter_generate: "cover_letter",
  cover_letter_tone: "cover_letter",
  message_personalize: "recruiter_outreach",
  ops_meeting_summary: "chat",
  page_video_scaffold: "studio_script",
  profile_audit: "profile_audit",
  recruiter_agent_intake: "recruiter_match",
  recruiter_agent_score: "recruiter_match",
  recruiter_extract_profile: "recruiter_match",
  recruiter_match_score_candidates: "recruiter_match",
  recruiter_match_score_jobs: "recruiter_match",
  recruiter_outreach: "recruiter_outreach",
  resume_consolidate_highlights: "resume_consolidate_highlights",
  resume_image_ocr: "resume_ocr",
  resume_parse_ai: "resume_optimize",
  resume_roast: "resume_roast",
  resume_shorten_bullet: "resume_consolidate_highlights",
  resume_summary: "resume_summary",
  resume_template_extractor: "resume_consolidate_highlights",
  salary_analyze: "salary_estimate",
  salary_negotiation: "salary_negotiation",
  scorecard_bias_check: "scorecard_bias_check",
  skill_extractor: "skill_extract",
  studio_ats_package: "studio_misc",
  studio_clarity_score: "reviews",
  studio_dubbing_translate: "studio_misc",
  studio_edit_script: "studio_edit_script",
  studio_game_agent: "studio_game_agent",
  studio_hook_optimize: "studio_script",
  studio_interview_score: "interview_analyze",
  studio_interview_talking_points: "interview_questions",
  studio_script_rewrite: "studio_misc",
  studio_skills_demo_script: "studio_script",
  studio_storyboard: "studio_script",
  studio_thumbnail_score: "studio_misc",
  value_proposition_generate: "value_proposition",
  video_pitch_script: "video_pitch_script",
  visitor_chat: "chat",
};

/** All registered feature keys that roll up to `useCase`, sorted. Empty when
 *  none map to it. Drives the SA `/use-cases` per-row feature-key list. */
export function featureKeysForUseCase(useCase: LLMUseCase): string[] {
  return Object.entries(FEATURE_KEY_USE_CASE)
    .filter(([, uc]) => uc === useCase)
    .map(([key]) => key)
    .sort();
}
