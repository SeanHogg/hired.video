/**
 * Pure match-domain handlers — the Job↔Resume scoring + tailoring flows.
 *
 * Facade — the code lives in cohesive sibling modules:
 *   • match-deps.ts             — `MatchDeps` port (DB, clock, LLM)
 *   • match-schemas.ts          — request/response schemas + lenient ingest
 *   • match-text.ts             — TEXT_CAP, flatteners, keyword fallback
 *   • match-resolvers.ts        — job / résumé resolvers every fit flow shares
 *   • match-score-cache.ts      — resume_match_scores read/write
 *   • match-scoring-handlers.ts — handleAnalyze / Byid / Insights / ByContent
 * New code should import from those modules directly.
 *
 * Tailor lives in tailor-edits.ts (pure: edit contract, prompt, apply) +
 * tailor-handler.ts (the use case).
 */
export type { DbPort, MatchDeps } from "./match-deps.js";
export {
  MatchInputSchema,
  MatchByContentSchema,
  MatchByIdSchema,
  MatchInsightsSchema,
  AnalyzeResponseSchema,
  InsightsResponseSchema,
  InsightsResponseIngest,
} from "./match-schemas.js";
export {
  TEXT_CAP,
  htmlToPlainText,
  jobRowToLLMText,
  resumeContentToText,
  keywordScore,
} from "./match-text.js";
export {
  resolveJob,
  type ResolvedJobV2,
  parsedJobFromRow,
  resolveJobV2,
  resolveJobForFit,
  type ResolvedResumeV2,
  resolveResumeV2,
  resolveResume,
} from "./match-resolvers.js";
export { loadPriorRecommendations } from "./match-score-cache.js";
export {
  handleAnalyze,
  handleByid,
  handleInsights,
  handleByContent,
} from "./match-scoring-handlers.js";
