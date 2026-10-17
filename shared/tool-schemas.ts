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
// Resume Analysis — single engine behind the `resume-score` and
// `resume-optimize` AI tools (POST /api/ai/tools/:toolId). The two routes are different SEO/funnel
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

/** The diagnostic bucket of a recommendation — a closed set, so the UI's
 *  flag labels are exhaustive (#374). Free-form model output is coerced
 *  onto it by the analyzer's lenient ingest. */
export const RECOMMENDATION_CATEGORIES = ["ats", "keywords", "format", "content", "impact", "structure"] as const;
export const RecommendationCategorySchema = z.enum(RECOMMENDATION_CATEGORIES);
export type RecommendationCategory = z.infer<typeof RecommendationCategorySchema>;

/** Registered wand action ids — each is a résumé tool id in the frontend
 *  registry (lib/tools/registry.ts + lib/tools/resume-wands.ts). When the
 *  analyzer tags a recommendation with one, the frontend dispatches to that
 *  wand with `actionArgs` — it never keyword-matches the prose (#374). A new
 *  wand is one id here + one args schema below + one registry entry (#375). */
export const WAND_ACTION_IDS = [
  "apply_resume_rewrite",
  "shorten_bullet",
  "consolidate_section_highlights",
  "standardize_resume_dates",
  "update_resume_summary",
  "add_resume_skill",
  "merge_work_entries",
  "add_bullet_metric",
  "strengthen_bullet_verbs",
  "init_resume_section",
] as const;
export const WandActionIdSchema = z.enum(WAND_ACTION_IDS);
export type WandActionId = z.infer<typeof WandActionIdSchema>;

/** A line quoted from the résumé — how a wand finds the slot it edits. */
const QuotedLineSchema = z.string().trim().min(6).max(2000);
/** An entry's natural key as it reads on the page ("Acme Corp"). */
const EntryNameSchema = z.string().trim().min(1).max(200);

/** Sections `init_resume_section` can start from what the résumé already says. */
export const INIT_RESUME_SECTIONS = ["summary", "skills"] as const;
export type InitResumeSection = (typeof INIT_RESUME_SECTIONS)[number];

/** The args each wand takes. Unknown keys are stripped; a recommendation
 *  whose args fail its wand's schema keeps its text but loses the action. */
export const WAND_ACTION_ARGS = {
  apply_resume_rewrite: z.object({ original: QuotedLineSchema, improved: z.string().trim().min(1).max(2000) }),
  shorten_bullet: z.object({ original: QuotedLineSchema }),
  consolidate_section_highlights: z.object({ matchHighlight: QuotedLineSchema }),
  standardize_resume_dates: z.object({}),
  update_resume_summary: z.object({ summary: z.string().trim().min(20).max(2000) }),
  add_resume_skill: z.object({ name: z.string().trim().min(1).max(120) }),
  merge_work_entries: z.object({ first: EntryNameSchema, second: EntryNameSchema }),
  add_bullet_metric: z.object({ original: QuotedLineSchema }),
  strengthen_bullet_verbs: z.object({ original: QuotedLineSchema }),
  init_resume_section: z.object({ section: z.enum(INIT_RESUME_SECTIONS) }),
} as const satisfies Record<WandActionId, z.ZodType>;

export type WandActionArgs<Id extends WandActionId = WandActionId> = z.infer<(typeof WAND_ACTION_ARGS)[Id]>;

/** A validated structured action: a known wand + args that fit it. */
export interface RecommendationAction {
  actionId: WandActionId;
  actionArgs: Record<string, unknown>;
}

/** Validate a model-emitted `{ actionId, actionArgs }` pair. Null when the id
 *  is not a wand or the args don't fit it — the caller drops the action. */
export function parseRecommendationAction(actionId: unknown, actionArgs: unknown): RecommendationAction | null {
  const id = WandActionIdSchema.safeParse(typeof actionId === "string" ? actionId.trim() : actionId);
  if (!id.success) return null;
  const args = WAND_ACTION_ARGS[id.data].safeParse(actionArgs ?? {});
  return args.success ? { actionId: id.data, actionArgs: args.data as Record<string, unknown> } : null;
}

/** Single recommendation — superset of the legacy ScoreRecommendation +
 *  OptimizationSuggestion shapes. `severity` is the canonical name (was
 *  `type` on the optimizer + `category` on the scorer). `category`
 *  carries the diagnostic bucket (a closed enum). `impact` is a free-form
 *  weight; numeric for the scorer (1-10), prose for the optimizer
 *  ("High"/"Medium"/"Low"). `actionId` + `actionArgs` (#374) are the
 *  structured dispatch path, validated together by
 *  `parseRecommendationAction` — present only when the args fit the wand. */
export const ResumeRecommendationSchema = z.object({
  severity: RecommendationSeveritySchema,
  category: RecommendationCategorySchema,
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

// Rewrite one bullet through a single editorial lens (#375): `metric` puts a
// measurable outcome up front (bracketed placeholders like "[N]%" where the
// résumé has no number — never an invented one); `verbs` replaces a weak
// opening ("Responsible for", "Helped") with a strong action verb. Same
// `{ improved }` answer as shorten, routed through apply_resume_rewrite.
export const BULLET_REWRITE_MODES = ["metric", "verbs"] as const;
export type BulletRewriteMode = (typeof BULLET_REWRITE_MODES)[number];

export const RewriteBulletRequestSchema = z.object({
  original: z.string().min(1).max(2000),
  mode: z.enum(BULLET_REWRITE_MODES),
});
export const RewriteBulletResponseSchema = z.object({
  improved: z.string().min(1).max(600),
});
export type RewriteBulletRequest = z.infer<typeof RewriteBulletRequestSchema>;
export type RewriteBulletResponse = z.infer<typeof RewriteBulletResponseSchema>;

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
// Value Proposition — AI tool `value-proposition`
// ────────────────────────────────────────────────────────────────────────

/** The job is a tracked job id OR pasted text; the résumé is one of the
 *  caller's résumé ids OR pasted text. Company fields are optional context. */
export const ValuePropositionRequestSchema = z
  .object({
    jobId: z.string().min(1).optional(),
    jobContent: z.string().max(50_000).optional(),
    resumeId: z.string().min(1).optional(),
    resumeContent: z.string().max(50_000).optional(),
    companyName: z.string().max(200).optional(),
    companyMission: z.string().max(2_000).optional(),
    companyValues: z.string().max(2_000).optional(),
  })
  .refine((r) => Boolean(r.jobId || r.jobContent?.trim()), { message: "Provide jobId or jobContent", path: ["jobContent"] })
  .refine((r) => Boolean(r.resumeId || r.resumeContent?.trim()), { message: "Provide resumeId or resumeContent", path: ["resumeContent"] });

export type ValuePropositionRequest = z.infer<typeof ValuePropositionRequestSchema>;

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
// Sentiment — AI tool `sentiment` ({ text } | { resumeId } | { jobId })
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
