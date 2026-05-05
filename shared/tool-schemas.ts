/**
 * Shared Zod response schemas for the AI Tools API surface.
 *
 * Single source of truth for the response contract between the Hono
 * backend and the React frontend. Import these from:
 *   • API routes — to lock the response shape at the boundary
 *   • Frontend services — as the `schema` argument to `apiClient.post()`
 *
 * Roadmap #147. Before these existed, each side defined its own interface
 * and they drifted (the 2026-04-14 ValueProposition `createfromfile`
 * ticket was the canonical example — server returned a Job missing
 * the enum fields the frontend's strict JobSchema required).
 *
 * Every schema describes the payload inside `data:` — i.e., what the
 * frontend sees after `apiClient` unwraps the envelope. The envelope
 * itself (`{ success, data, timestamp }`) is validated by
 * `ApiResponseSchema` in `shared/api.ts`.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────
// Shared value objects
// ────────────────────────────────────────────────────────────────────────

/** A numeric score in the 0–100 range. */
export const ScoreSchema = z.number().min(0).max(100);

/** Letter grade with optional +/- modifier. */
export const LetterGradeSchema = z
  .string()
  .regex(/^[A-F][+-]?$/, "grade must match /[A-F][+-]?/");

// ────────────────────────────────────────────────────────────────────────
// Resume Scorer — POST /api/resumescorer/score
// ────────────────────────────────────────────────────────────────────────

export const ScoreRecommendationSchema = z.object({
  category: z.string(),
  title: z.string(),
  description: z.string(),
  impact: z.number(),
});

/** Full pro payload — all six subscores + recommendations. */
export const FullResumeScoreSchema = z.object({
  overallScore: ScoreSchema,
  atsCompatibility: ScoreSchema,
  contentQuality: ScoreSchema,
  keywordScore: ScoreSchema,
  formatScore: ScoreSchema,
  impactScore: ScoreSchema,
  grade: LetterGradeSchema,
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(ScoreRecommendationSchema),
});

/** Anonymous / free-tier preview — score + grade only, plus upsell flags. */
export const ResumeScorePreviewSchema = z.object({
  overallScore: ScoreSchema,
  grade: LetterGradeSchema,
  isProPreview: z.literal(true),
  teaserRecommendation: z
    .object({ title: z.string(), impact: z.number() })
    .nullable()
    .optional(),
  lockedDetails: z.array(z.string()).optional(),
  upgradeUrl: z.string(),
});

/** Union — the /score endpoint returns a preview OR a full result. */
export const ScoreResponseSchema = z.union([
  FullResumeScoreSchema,
  ResumeScorePreviewSchema,
]);

export type FullResumeScore = z.infer<typeof FullResumeScoreSchema>;
export type ResumeScorePreview = z.infer<typeof ResumeScorePreviewSchema>;
export type ScoreResponse = z.infer<typeof ScoreResponseSchema>;
export type ScoreRecommendation = z.infer<typeof ScoreRecommendationSchema>;

// ────────────────────────────────────────────────────────────────────────
// Resume Optimizer — POST /api/resumeoptimizer/optimize
// ────────────────────────────────────────────────────────────────────────

export const OptimizationSuggestionSchema = z.object({
  type: z.string(),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  impact: z.string(),
});

export const OptimizerResponseSchema = z.object({
  overallScore: ScoreSchema,
  atsScore: ScoreSchema,
  keywordScore: ScoreSchema,
  formatScore: ScoreSchema,
  contentScore: ScoreSchema,
  suggestions: z.array(OptimizationSuggestionSchema),
  optimizedContent: z.string(),
});

export const AtsAnalysisResponseSchema = z.object({
  score: ScoreSchema,
  issues: z.array(z.unknown()),
});

export const KeywordSuggestionsResponseSchema = z.object({
  keywords: z.array(z.string()),
});

// Consolidate highlights — input is the raw bullet list for a single section
// item (a Work / Volunteer / Project entry) plus the surrounding context the
// LLM needs to make the rewrite specific (role, organization, summary). The
// response is a fresh array of consolidated bullets the user can accept.
export const ConsolidateHighlightsRequestSchema = z.object({
  highlights: z.array(z.string().max(1000)).min(1).max(60),
  context: z
    .object({
      role: z.string().max(200).optional(),
      organization: z.string().max(200).optional(),
      summary: z.string().max(2000).optional(),
    })
    .optional(),
});

export const ConsolidateHighlightsResponseSchema = z.object({
  highlights: z.array(z.string().min(1).max(500)).max(20),
});

export type OptimizerResponse = z.infer<typeof OptimizerResponseSchema>;
export type OptimizationSuggestion = z.infer<typeof OptimizationSuggestionSchema>;
export type AtsAnalysisResponse = z.infer<typeof AtsAnalysisResponseSchema>;
export type KeywordSuggestionsResponse = z.infer<typeof KeywordSuggestionsResponseSchema>;
export type ConsolidateHighlightsRequest = z.infer<typeof ConsolidateHighlightsRequestSchema>;
export type ConsolidateHighlightsResponse = z.infer<typeof ConsolidateHighlightsResponseSchema>;

// ────────────────────────────────────────────────────────────────────────
// Salary Calculator — POST /api/salarycalculator/*
// ────────────────────────────────────────────────────────────────────────

export const SalaryAnalysisResponseSchema = z.object({
  medianSalary: z.number(),
  estimatedSalary: z.number(),
  salaryRange: z.object({
    min: z.number(),
    max: z.number(),
  }),
  percentiles: z.object({
    p10: z.number(),
    p25: z.number(),
    p50: z.number(),
    p75: z.number(),
    p90: z.number(),
  }),
  locationAdjustment: z.number(),
  industryComparison: z.object({
    industry: z.string(),
    marketPosition: z.string(),
  }),
});

export const NegotiationTipsResponseSchema = z.object({
  strategies: z.array(z.string()),
  talkingPoints: z.array(z.string()),
  targetRange: z
    .object({ min: z.number(), max: z.number() })
    .optional(),
});

export type SalaryAnalysisResponse = z.infer<typeof SalaryAnalysisResponseSchema>;
export type NegotiationTipsResponse = z.infer<typeof NegotiationTipsResponseSchema>;

// ────────────────────────────────────────────────────────────────────────
// Value Proposition — POST /api/valueproposition/generate/*
// ────────────────────────────────────────────────────────────────────────

export const ValuePropositionResponseSchema = z.object({
  valueProposition: z.string(),
  executiveSummary: z.string(),
  keyStrengths: z.array(z.string()),
  alignmentPoints: z.array(z.string()),
  callToAction: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export type ValuePropositionResponse = z.infer<typeof ValuePropositionResponseSchema>;

// ────────────────────────────────────────────────────────────────────────
// Sentiment — POST /sentiment/sentimentprediction
// ────────────────────────────────────────────────────────────────────────

export const SentimentResponseSchema = z.object({
  score: z.number().min(0).max(100),
});

export type SentimentResponse = z.infer<typeof SentimentResponseSchema>;

// ────────────────────────────────────────────────────────────────────────
// Resume Summarize — POST /api/resumes/summarize
// ────────────────────────────────────────────────────────────────────────

export const SummarizeResponseSchema = z.object({
  result: z.string(),
});

export type SummarizeResponse = z.infer<typeof SummarizeResponseSchema>;
