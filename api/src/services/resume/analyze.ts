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
import type { Env, Variables } from "../../types/index.js";
import {
  ResumeAnalysisSchema,
  type ResumeAnalysis,
} from "../../../../shared/tool-schemas.js";
import { scoreWithLLMOrFallback } from "./score-with-llm.js";

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
      "impact": <1-10>
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

Recommendations must be specific to THIS resume — quote phrases the candidate already used. Do not invent achievements; only rewrite or surface what's already on the page. Recommendations should be actionable: each one should map to either consolidating duplicate bullets, standardizing dates, shortening a verbose bullet, adding a metric, or rewriting one specific phrase.`;

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
  c: Context<{ Bindings: Env; Variables: Variables }>;
  /** Telemetry slug — `resume_scorer` vs `resume_optimizer` so the two
   *  funnels stay distinguishable in usage analytics. */
  featureKey: string;
  resumeText: string;
  jobDescription?: string;
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

  return scoreWithLLMOrFallback({
    c: args.c,
    featureKey: args.featureKey,
    useCase: "resume_optimize",
    resumeText: args.resumeText,
    systemPrompt: ANALYZE_SYSTEM_PROMPT,
    userMessage,
    schema: ResumeAnalysisSchema,
    fallback: buildAnalysisFallback(),
  });
}
