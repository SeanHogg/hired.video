import { Hono } from "hono";
import type { Env, Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { attachTokenBudget, requireTokenBudget } from "../middleware/tierEnforcement.js";
import { persistResumeScoresIfReferenced } from "../services/resume/persist-scores.js";
import { scoreWithLLMOrFallback } from "../services/resume/score-with-llm.js";
import { OptimizerResponseSchema } from "../../../shared/tool-schemas.js";

export const resumeOptimizerRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
resumeOptimizerRoutes.use("*", attachTokenBudget());

/**
 * Deterministic fallback when the LLM is unavailable (no API key in
 * dev/test, or upstream errors). Same shape the LLM returns —
 * `OptimizerResponseSchema` validates both paths.
 */
function buildOptimizationResult() {
  return {
    overallScore: 79,
    atsScore: 82,
    keywordScore: 75,
    formatScore: 80,
    contentScore: 78,
    suggestions: [
      {
        type: "important",
        category: "keywords",
        title: "Include role-specific keywords",
        description: "Mirror terms from target job descriptions in your experience bullets.",
        impact: "High",
      },
    ],
    optimizedContent: "Optimized resume content draft.",
  };
}

type OptimizationResult = ReturnType<typeof buildOptimizationResult>;

/** Project the optimizer's response shape into the persistent scores
 *  blob. Mirrors `scoreToScores` in resume-scorer.ts — both routes write
 *  to the same column and so must agree on the field names (overall /
 *  ats / content / keyword / format / impact). The optimizer doesn't
 *  emit `impact`, so it stays absent in the blob until the scorer fills
 *  it in. */
export function optimizationToScores(
  r: OptimizationResult,
): Record<string, number> {
  return {
    overall: r.overallScore,
    ats: r.atsScore,
    content: r.contentScore,
    keyword: r.keywordScore,
    format: r.formatScore,
  };
}

const OPTIMIZER_SYSTEM_PROMPT = `You are an expert resume editor optimizing a candidate's resume for ATS systems and recruiters. The user will provide their resume text and (optionally) a target job description. Return ONLY valid JSON in this exact shape:

{
  "overallScore": <0-100>,
  "atsScore": <0-100>,
  "keywordScore": <0-100>,
  "formatScore": <0-100>,
  "contentScore": <0-100>,
  "suggestions": [
    {
      "type": "critical" | "important" | "minor",
      "category": "keywords" | "structure" | "content" | "format" | "impact",
      "title": "<short imperative>",
      "description": "<1-2 sentences>",
      "impact": "High" | "Medium" | "Low"
    }
  ],
  "optimizedContent": "<rewritten resume — preserve the candidate's voice and achievements, tighten language, surface metrics, mirror target-role keywords when a job description is supplied. Plain text, no markdown.>"
}

Scoring guide:
- atsScore: parseable structure, standard sections, no tables/columns
- keywordScore: density of relevant skills (weighted higher when a job description is supplied)
- formatScore: readability, consistent dates, scannable bullets
- contentScore: clarity, specificity, no jargon-without-substance
- overallScore: weighted summary (NOT a simple average — content + keywords drive the headline)

Suggestions must be specific to THIS resume (quote phrases when possible). Do not invent achievements; only rewrite what's already on the page.`;

resumeOptimizerRoutes.post("/optimize", requireTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const resumeText =
    typeof body === "object" && body !== null && typeof (body as any).resumeText === "string"
      ? ((body as any).resumeText as string)
      : "";
  const jobDescription =
    typeof body === "object" && body !== null && typeof (body as any).jobDescription === "string"
      ? ((body as any).jobDescription as string)
      : "";

  const userMessage = jobDescription.trim().length > 0
    ? `Optimize this resume for the target job description.\n\n=== Resume ===\n${resumeText}\n\n=== Target job ===\n${jobDescription.slice(0, 6000)}`
    : `Optimize this resume.\n\n=== Resume ===\n${resumeText}`;

  const llmOrFallback = await scoreWithLLMOrFallback({
    c,
    featureKey: "resume_optimizer",
    useCase: "resume_optimize",
    resumeText,
    systemPrompt: OPTIMIZER_SYSTEM_PROMPT,
    userMessage,
    schema: OptimizerResponseSchema,
    fallback: buildOptimizationResult(),
  });
  if (llmOrFallback instanceof Response) return llmOrFallback;
  const result = llmOrFallback as OptimizationResult;

  // Persist scores on the resume row when the caller passed `{ resumeId }`.
  // When no resumeId is given, the score lives only in tool-run history.
  await persistResumeScoresIfReferenced(body, c.var.user, optimizationToScores(result));

  return c.json(success(result), 200);
});

resumeOptimizerRoutes.post("/ats-analysis", requireTokenBudget(), async (c) => {
  return c.json(success({ score: 82, issues: [] }), 200);
});

resumeOptimizerRoutes.post("/keyword-suggestions", requireTokenBudget(), async (c) => {
  // Wrap the raw keyword array in an object so every route's `data` field
  // is consistently an object (fixes LSP violation flagged in roadmap #147).
  return c.json(success({ keywords: ["leadership", "automation", "cross-functional"] }), 200);
});

resumeOptimizerRoutes.all("*", (c) =>
  c.json(
    { success: false as const, error: { code: "NOT_IMPLEMENTED", message: "Resume optimizer route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);
