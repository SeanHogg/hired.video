/**
 * Single resume-analysis engine. Both `/api/resumescorer/score` and
 * `/api/resumeoptimizer/optimize` are thin proxies that call this
 * service — same prompt, same Zod schema, same fallback shape.
 *
 * Why one engine: the two routes existed historically as a Scorer
 * (free, surfaces grade + strengths/weaknesses) and an Optimizer (Pro,
 * surfaces an optimized rewrite). They asked the LLM essentially the
 * same question with slightly different output keys, ran two separate
 * prompts per page-load, and produced recommendations that drifted
 * from each other. Collapsing them means one round-trip, one canonical
 * recommendation list, and Action buttons rendered identically on
 * both surfaces.
 *
 * The two HTTP routes still exist (different SEO funnels, different
 * tool-run history rows) but are presentation-only — they project the
 * same `ResumeAnalysis` payload through different default field sets.
 */

import type { Context } from "hono";
import { z } from "zod";
import type { Env, Variables, AppEnv } from "../../types/index.js";
import {
  ResumeAnalysisSchema,
  ResumeRecommendationSchema,
  RecommendationSeveritySchema,
  RecommendationCategorySchema,
  parseRecommendationAction,
  type ResumeAnalysis,
  type ResumeRecommendation,
} from "../../../../shared/tool-schemas.js";
import { scoreWithLenientLLMOrFallback } from "./score-with-llm.js";
import { defineLenientIngest, type LLMStreamSink } from "../adapters/llm-client.js";
import { coerceEnum } from "../adapters/lenient-coerce.js";

const ANALYZE_SYSTEM_PROMPT = `You are an expert resume reviewer + editor for hired.video. The user provides their resume text and (optionally) a target job description. Score the resume across the canonical six dimensions used by ATS systems and senior hiring managers, then return a prioritized list of fixes the platform's wand tools can apply automatically.

Return ONLY valid JSON in this exact shape:

{
  "overallScore": <0-100>,
  "atsScore": <0-100>,
  "contentScore": <0-100>,
  "keywordScore": <0-100>,
  "formatScore": <0-100>,
  "impactScore": <0-100>,
  "grade": "<A+|A|A-|B+|B|B-|C+|C|C-|D|F>",
  "strengths": [<2-4 specific strengths — quote phrases when possible>],
  "weaknesses": [<2-4 specific weaknesses — quote phrases when possible>],
  "recommendations": [
    {
      "severity": "critical" | "important" | "minor",
      "category": "ats" | "keywords" | "format" | "content" | "impact" | "structure",
      "title": "<short imperative>",
      "description": "<1-2 sentences>",
      "impact": <1-10>,
      "actionId": "<one wand id from the list below, or omit>",
      "actionArgs": { <that wand's args, exactly as listed> }
    }
  ],
  "optimizedContent": "<rewritten resume preserving the candidate's voice and achievements; tighten language, surface metrics, mirror target-role keywords when a job description is supplied. Plain text, no markdown.>"
}

Scoring guide (calibrate honestly, don't grade-inflate):
- atsScore: parseable structure, standard section names, no tables/columns/images
- contentScore: clarity, specificity, no jargon-without-substance
- keywordScore: density of role-relevant skills (weighted higher when a job description is supplied)
- formatScore: readability, consistent dates, scannable bullets
- impactScore: quantified outcomes (numbers, %, $, scale) over responsibility lists
- overallScore: weighted summary (NOT a simple average — impact + content drive the headline)
- grade: A=85-100, B=70-84, C=55-69, D=40-54, F<40

Recommendations must be specific to THIS resume — quote phrases the candidate already used. Do not invent achievements; only rewrite or surface what's already on the page.

Every recommendation that one of these wands can fix MUST carry "actionId" + "actionArgs" (copy quoted lines EXACTLY as they appear on the resume — the wand finds the line by that text):
- "apply_resume_rewrite": {"original": "<line on the resume>", "improved": "<your rewrite of that one line>"} — reword one bullet or summary
- "shorten_bullet": {"original": "<a verbose bullet>"}
- "add_bullet_metric": {"original": "<a bullet with no measurable outcome>"}
- "strengthen_bullet_verbs": {"original": "<a bullet that opens weakly: 'Responsible for', 'Helped', 'Worked on'>"}
- "consolidate_section_highlights": {"matchHighlight": "<any one bullet of the entry with overlapping bullets>"}
- "merge_work_entries": {"first": "<company name>", "second": "<company name>"} — two entries that are really one role
- "standardize_resume_dates": {} — mixed date formats
- "init_resume_section": {"section": "summary" | "skills"} — the section is missing
- "update_resume_summary": {"summary": "<a full replacement summary>"}
- "add_resume_skill": {"name": "<a skill the resume already shows evidence of>"}
Omit "actionId" when no wand fits. Never put an id outside this list.`;

/** Deterministic placeholder used when the LLM is unavailable (no API
 *  key in dev/test, upstream errors, or schema-validation failures).
 *  Same shape `ResumeAnalysisSchema` validates the LLM path against —
 *  one source of truth for "what does an analysis look like." */
export function buildAnalysisFallback(): ResumeAnalysis {
  return {
    overallScore: 74,
    atsScore: 78,
    contentScore: 72,
    keywordScore: 70,
    formatScore: 76,
    impactScore: 71,
    grade: "B",
    strengths: ["Clear structure", "Action-oriented language"],
    weaknesses: ["Could add more measurable outcomes"],
    recommendations: [
      {
        severity: "important",
        category: "impact",
        title: "Add quantified achievements",
        description: "Include metrics such as percentages, revenue, or time saved.",
        impact: 8,
      },
    ],
    optimizedContent: "Optimized resume content draft.",
  };
}

/** Project a `ResumeAnalysis` into the persisted scores blob on the
 *  resume row. Mirrors the historic split of `scoreToScores` +
 *  `optimizationToScores` (which wrote to the same column under
 *  different field names). One projection now — the source field
 *  names are canonical. */
export function analysisToScores(r: ResumeAnalysis): Record<string, number> {
  const scores: Record<string, number> = {
    overall: r.overallScore,
    ats: r.atsScore,
    content: r.contentScore,
    keyword: r.keywordScore,
    format: r.formatScore,
  };
  if (typeof r.impactScore === "number") scores.impact = r.impactScore;
  return scores;
}

export interface AnalyzeResumeArgs {
  c: Context<AppEnv>;
  /** Telemetry slug — `resume_scorer` vs `resume_optimizer` so the two
   *  funnels stay distinguishable in usage analytics. */
  featureKey: string;
  resumeText: string;
  jobDescription?: string;
  /** Stream the model's answer as it is generated (#1342). */
  stream?: LLMStreamSink;
}

/** Single LLM round-trip the two routes share. Returns the analysis or
 *  Throws `TokenBudgetExceededError` when the caller is over budget;
 *  the global `app.onError` handler converts it to a 429 response. */
export async function analyzeResume(
  args: AnalyzeResumeArgs,
): Promise<ResumeAnalysis> {
  const userMessage =
    args.jobDescription && args.jobDescription.trim().length > 0
      ? `Analyze this resume against the target job description.\n\n=== Resume ===\n${args.resumeText}\n\n=== Target job ===\n${args.jobDescription.slice(0, 6000)}`
      : `Analyze this resume.\n\n=== Resume ===\n${args.resumeText}`;

  return scoreWithLenientLLMOrFallback({
    c: args.c,
    featureKey: args.featureKey,
    useCase: "resume_optimize",
    resumeText: args.resumeText,
    systemPrompt: ANALYZE_SYSTEM_PROMPT,
    userMessage,
    ingest: ResumeAnalysisIngest,
    fallback: buildAnalysisFallback(),
    stream: args.stream,
  });
}

// ─── Lenient ingest spec ──────────────────────────────────────────────────
//
// `ResumeRecommendationSchema.severity` is a strict enum — both AI Resume
// Scorer and Resume Optimizer go through this engine, so a single drift
// (e.g. "high" / "moderate" / "low") used to take the whole analysis
// down. Lenient ingest accepts any string for `severity` and the coerce
// step maps it onto the canonical bucket via the shared `coerceEnum`
// helper. Aliases are derived from values free-tier models actually
// emit — kept in lockstep with the system prompt's vocabulary.

const SEVERITY_ALLOWED = RecommendationSeveritySchema.options;
const SEVERITY_ALIASES: Record<string, (typeof SEVERITY_ALLOWED)[number]> = {
  high: "critical", urgent: "critical", blocker: "critical", major: "critical",
  severe: "critical", red: "critical",
  medium: "important", moderate: "important", warning: "important",
  recommended: "important", yellow: "important",
  low: "minor", info: "minor", suggestion: "minor", trivial: "minor",
  nit: "minor", green: "minor",
};

const CATEGORY_ALLOWED = RecommendationCategorySchema.options;
const CATEGORY_ALIASES: Record<string, (typeof CATEGORY_ALLOWED)[number]> = {
  keyword: "keywords", skills: "keywords", skill: "keywords",
  formatting: "format", layout: "format", dates: "format", readability: "format",
  clarity: "content", wording: "content", language: "content", summary: "content",
  metrics: "impact", achievements: "impact", results: "impact", quantification: "impact",
  sections: "structure", organization: "structure", order: "structure", length: "structure",
  parsing: "ats", atscompatibility: "ats",
};

// Free models drift on the category bucket and invent wand ids / arg
// shapes; the wire accepts any string / record and the coerce step keeps
// only what the canonical schema allows (a bad action is dropped, never the
// recommendation).
const LenientResumeRecommendationSchema = ResumeRecommendationSchema.extend({
  severity: z.string().min(1),
  category: z.string().default("content"),
  actionId: z.string().optional(),
});

const LenientResumeAnalysisSchema = ResumeAnalysisSchema.extend({
  recommendations: z.array(LenientResumeRecommendationSchema),
});

export const ResumeAnalysisIngest = defineLenientIngest({
  name: "ResumeAnalysisResponse",
  ingest: LenientResumeAnalysisSchema,
  coerce: (wire): ResumeAnalysis => ({
    ...wire,
    recommendations: wire.recommendations.map(coerceRecommendation),
  }),
});

/** One wire recommendation → canonical: severity + category onto their
 *  enums, and the wand action kept only when `parseRecommendationAction`
 *  validates the id and its args together. Exported for the ingest tests. */
export function coerceRecommendation(r: z.infer<typeof LenientResumeRecommendationSchema>): ResumeRecommendation {
  const { actionId, actionArgs, ...rest } = r;
  const action = actionId ? parseRecommendationAction(actionId, actionArgs) : null;
  return {
    ...rest,
    severity: coerceEnum(r.severity, { allowed: SEVERITY_ALLOWED, aliases: SEVERITY_ALIASES, fallback: "important" }),
    category: coerceEnum(r.category, { allowed: CATEGORY_ALLOWED, aliases: CATEGORY_ALIASES, fallback: "content" }),
    ...(action ?? {}),
  };
}
