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
// Resume Analysis — single engine behind /api/resumescorer/score and
// /api/resumeoptimizer/optimize. The two routes are different SEO/funnel
// surfaces of the same diagnostic→prescription flow; both call one
// service, both return this superset shape, and the frontend's
// <ResumeAnalysisToolPage> renders whatever fields are present.
//
// Severity used by both Optimizer ("type") and Scorer ("category") — kept
// as a tight enum so the frontend's icon/colour selector is exhaustive.
// ────────────────────────────────────────────────────────────────────────

export const RecommendationSeveritySchema = z.enum([
  "critical",
  "important",
  "minor",
]);

/** Registered wand action ids — when the LLM tags a recommendation
 *  with one of these in `actionId`, the frontend dispatches directly
 *  to the wand instead of keyword-matching `title + description` in
 *  `find-wand-for-recommendation.ts` (#374). Keep this list in lockstep
 *  with the wand registry. */
export const WAND_ACTION_IDS = [
  "consolidate_section_highlights",
  "standardize_resume_dates",
  "shorten_bullet",
  "rewrite_summary",
  "extract_keywords",
] as const;
export const WandActionIdSchema = z.enum(WAND_ACTION_IDS);
export type WandActionId = z.infer<typeof WandActionIdSchema>;

/** Single recommendation — superset of the legacy ScoreRecommendation +
 *  OptimizationSuggestion shapes. `severity` is the canonical name (was
 *  `type` on the optimizer + `category` on the scorer). `category`
 *  carries the diagnostic bucket (ats / keywords / format / content /
 *  impact / structure). `impact` is a free-form weight; numeric for the
 *  scorer (1-10), prose for the optimizer ("High"/"Medium"/"Low").
 *  `actionId` (#374) is the structured dispatch path — when present,
 *  the resolver maps directly to the wand instead of keyword-matching
 *  the prose. `actionArgs` carries the wand's input payload. */
export const ResumeRecommendationSchema = z.object({
  severity: RecommendationSeveritySchema,
  category: z.string(),
  title: z.string(),
  description: z.string(),
  impact: z.union([z.number(), z.string()]).optional(),
  actionId: WandActionIdSchema.optional(),
  actionArgs: z.record(z.string(), z.unknown()).optional(),
});

/** Merged response from the analysis engine. Every field except scores +
 *  recommendations is optional — the engine fills what the prompt asked
 *  for; the page self-gates on what's present. */
export const ResumeAnalysisSchema = z.object({
  overallScore: ScoreSchema,
  atsScore: ScoreSchema,
  contentScore: ScoreSchema,
  keywordScore: ScoreSchema,
  formatScore: ScoreSchema,
  impactScore: ScoreSchema.optional(),
  grade: LetterGradeSchema.optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  recommendations: z.array(ResumeRecommendationSchema),
  optimizedContent: z.string().optional(),
});

/** Anonymous / free-tier preview — score + grade only, plus upsell flags. */
export const ResumeAnalysisPreviewSchema = z.object({
  overallScore: ScoreSchema,
  grade: LetterGradeSchema,
  isProPreview: z.literal(true),
  teaserRecommendation: z
    .object({ title: z.string(), impact: z.union([z.number(), z.string()]) })
    .nullable()
    .optional(),
  lockedDetails: z.array(z.string()).optional(),
  upgradeUrl: z.string(),
});

/** Union — the analysis endpoint returns a preview OR a full result. */
export const ResumeAnalysisResponseSchema = z.union([
  ResumeAnalysisSchema,
  ResumeAnalysisPreviewSchema,
]);

export type RecommendationSeverity = z.infer<typeof RecommendationSeveritySchema>;
export type ResumeRecommendation = z.infer<typeof ResumeRecommendationSchema>;
export type ResumeAnalysis = z.infer<typeof ResumeAnalysisSchema>;
export type ResumeAnalysisPreview = z.infer<typeof ResumeAnalysisPreviewSchema>;
export type ResumeAnalysisResponse = z.infer<typeof ResumeAnalysisResponseSchema>;

export const AtsAnalysisResponseSchema = z.object({
  score: ScoreSchema,
  issues: z.array(z.unknown()),
});

export const KeywordSuggestionsResponseSchema = z.object({
  keywords: z.array(z.string()),
});

// Shorten one bullet — single-shot LLM rewrite, used by the
// `shorten_bullet` registry tool and the inline editor's shorten wand.
// Returns `{ improved }` so the caller can route the result through the
// existing `apply_resume_rewrite` pipeline (no separate persistence
// path — one matcher to maintain).
export const ShortenBulletRequestSchema = z.object({
  original: z.string().min(1).max(2000),
  maxChars: z.number().int().min(40).max(500).optional(),
});

export const ShortenBulletResponseSchema = z.object({
  improved: z.string().min(1).max(500),
});

export type ShortenBulletRequest = z.infer<typeof ShortenBulletRequestSchema>;
export type ShortenBulletResponse = z.infer<typeof ShortenBulletResponseSchema>;

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

// Each consolidated bullet carries its provenance — the 1-based positions
// of the input bullets it was merged from. Lets the preview UI show "from
// 2, 5" badges and highlight the source bullets on hover so the user can
// see exactly what got fused before accepting the rewrite.
export const ConsolidateHighlightsItemSchema = z.object({
  text: z.string().min(1).max(500),
  sources: z.array(z.number().int().min(1)).max(60),
});

export const ConsolidateHighlightsResponseSchema = z.object({
  items: z.array(ConsolidateHighlightsItemSchema).max(20),
});

export type AtsAnalysisResponse = z.infer<typeof AtsAnalysisResponseSchema>;
export type KeywordSuggestionsResponse = z.infer<typeof KeywordSuggestionsResponseSchema>;
export type ConsolidateHighlightsRequest = z.infer<typeof ConsolidateHighlightsRequestSchema>;
export type ConsolidateHighlightsResponse = z.infer<typeof ConsolidateHighlightsResponseSchema>;
export type ConsolidateHighlightsItem = z.infer<typeof ConsolidateHighlightsItemSchema>;

// XYZ-format rewrite of a single text field (work summary, basics summary,
// or position/title). XYZ = "Accomplished [X] as measured by [Y], by doing
// [Z]" (Laszlo Bock / Google formulation). The single-string variant powers
// the wand next to summary/title inputs; the group variant for highlights
// reuses ConsolidateHighlightsResponseSchema so the existing review-dialog
// renders both flows without forking.
export const RewriteXyzKindSchema = z.enum(["summary", "position"]);
export type RewriteXyzKind = z.infer<typeof RewriteXyzKindSchema>;

export const RewriteXyzTextRequestSchema = z.object({
  kind: RewriteXyzKindSchema,
  original: z.string().min(1).max(4000),
  context: z
    .object({
      role: z.string().max(200).optional(),
      organization: z.string().max(200).optional(),
      // The highlights the field sits alongside — gives the model
      // grounding for what accomplishments the summary should foreshadow.
      highlights: z.array(z.string().max(1000)).max(60).optional(),
    })
    .optional(),
});

export const RewriteXyzTextResponseSchema = z.object({
  improved: z.string().min(1).max(2000),
  notes: z.array(z.string()).max(4).optional(),
});

export type RewriteXyzTextRequest = z.infer<typeof RewriteXyzTextRequestSchema>;
export type RewriteXyzTextResponse = z.infer<typeof RewriteXyzTextResponseSchema>;

// Highlights → XYZ group rewrite. Same I/O shape as consolidate-highlights
// so the existing review-dialog primitive can render both — the difference
// is the system prompt (consolidate = dedupe + tighten; xyz = reframe each
// bullet as X/Y/Z). Reusing the response schema is deliberate: the wand
// modes diverge in intent, not shape.
export const RewriteXyzHighlightsRequestSchema = ConsolidateHighlightsRequestSchema;
export const RewriteXyzHighlightsResponseSchema = ConsolidateHighlightsResponseSchema;
export type RewriteXyzHighlightsRequest = z.infer<typeof RewriteXyzHighlightsRequestSchema>;
export type RewriteXyzHighlightsResponse = z.infer<typeof RewriteXyzHighlightsResponseSchema>;

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
