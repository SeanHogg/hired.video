/**
 * Pure salary-domain handlers — the AI-Powered Salary Calculator flows.
 *
 * Same DI shape as `services/job/match-handlers.ts`:
 *   • Side-effecting deps (LLM client, usage recorder) flow in via the
 *     `SalaryDeps` port and can be faked in tests.
 *   • Business logic is testable with node:test (no Hono, no network).
 *   • Routes shrink to a thin adapter that parses the request, resolves
 *     env, and forwards to the handler.
 *
 * Covers:
 *   • handleAnalyze         — POST /api/salarycalculator/analyze
 *   • handleNegotiationTips — POST /api/salarycalculator/negotiation-tips
 *
 * Both endpoints are AI-first. When the LLM is unavailable (no API key,
 * every fallback model exhausted) we drop to a deterministic stub keyed
 * off years-of-experience — same shape as the LLM output, but ignores
 * title / location / industry. This is intentionally crude: the gap
 * between the rich LLM answer and the plain stub is the "AI-Powered"
 * value the page promises. The stub is a safety net, not a product.
 */

import { z } from "zod";
import { fail, ok, requireAuth, type HandlerResult } from "../../handlers/shared.js";
import type { LLMClient } from "../adapters/llm-client.js";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface SalaryDeps {
  /** LLM port — inject the prod client in routes, a fake in tests. The
   *  prod client charges `tokenLedger` automatically on every call, so
   *  handlers don't need a separate usage recorder. */
  llm: LLMClient | null;
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const SalaryAnalyzeInputSchema = z
  .object({
    jobTitle: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    location: z.string().trim().min(1).max(120).optional(),
    industry: z.string().trim().min(1).max(120).optional(),
    yearsExperience: z.number().finite().optional(),
    experienceYears: z.number().finite().optional(),
    education: z.string().trim().max(120).optional(),
    company: z.string().trim().max(120).optional(),
  })
  .transform((v) => ({
    jobTitle: v.jobTitle ?? v.title ?? "",
    location: v.location ?? "",
    industry: v.industry ?? "",
    yearsExperience: Math.max(
      0,
      Math.round(v.yearsExperience ?? v.experienceYears ?? 0),
    ),
    education: v.education ?? "",
    company: v.company ?? "",
  }));

export type SalaryAnalyzeInput = z.infer<typeof SalaryAnalyzeInputSchema>;

export const SalaryNegotiationInputSchema = z
  .object({
    jobTitle: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    location: z.string().trim().min(1).max(120).optional(),
    industry: z.string().trim().min(1).max(120).optional(),
    currentOffer: z.number().finite().nonnegative().optional(),
    marketRate: z.number().finite().nonnegative().optional(),
    yearsExperience: z.number().finite().optional(),
    experienceYears: z.number().finite().optional(),
  })
  .transform((v) => ({
    jobTitle: v.jobTitle ?? v.title ?? "",
    location: v.location ?? "",
    industry: v.industry ?? "",
    currentOffer: v.currentOffer,
    marketRate: v.marketRate,
    yearsExperience: Math.max(
      0,
      Math.round(v.yearsExperience ?? v.experienceYears ?? 0),
    ),
  }));

export type SalaryNegotiationInput = z.infer<typeof SalaryNegotiationInputSchema>;

// ---------------------------------------------------------------------------
// LLM output schemas
// ---------------------------------------------------------------------------

const PercentilesSchema = z.object({
  p10: z.number(),
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
  p90: z.number(),
});

const SalaryRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
});

/**
 * What we ask the LLM to produce. Richer than the public response
 * contract — extras (skillsPremium, careerGrowth, marketTrends, etc) are
 * passed through to the frontend opportunistically. Numbers are USD
 * gross annual.
 */
export const SalaryAnalysisLLMSchema = z.object({
  medianSalary: z.number().positive(),
  salaryRange: SalaryRangeSchema,
  percentiles: PercentilesSchema,
  /**
   * Multiplicative cost-of-living factor relative to a national-average
   * baseline (1.0 = on par). >1 for high-COL metros (SF, NYC), <1 for
   * lower-COL areas. Description is human-readable.
   */
  locationAdjustment: z.object({
    factor: z.number().min(0.3).max(3),
    description: z.string(),
  }),
  industryComparison: z.object({
    industryAverage: z.number().positive(),
    marketPosition: z.string(),
    topPayingCompanies: z.array(z.string()).default([]),
  }),
  experienceImpact: z
    .object({
      currentLevel: z.string(),
      salaryBoost: z.number(),
      nextMilestone: z.string(),
    })
    .optional(),
  skillsPremium: z
    .array(
      z.object({
        skill: z.string(),
        premium: z.number(),
        demand: z.string(),
      }),
    )
    .default([]),
  careerGrowth: z
    .object({
      nextRole: z.string(),
      timeframe: z.string(),
      salaryIncrease: z.number(),
    })
    .optional(),
  marketTrends: z
    .object({
      trend: z.string(),
      growthRate: z.string(),
      outlook: z.string(),
    })
    .optional(),
  negotiationRange: z
    .object({
      conservative: z.number(),
      target: z.number(),
      aggressive: z.number(),
    })
    .optional(),
});

export type SalaryAnalysisLLM = z.infer<typeof SalaryAnalysisLLMSchema>;

export const NegotiationLLMSchema = z.object({
  strategies: z.array(z.string()).min(1),
  talkingPoints: z.array(z.string()).min(1),
  targetRange: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Deterministic fallback — only used when LLM is unavailable.
//
// Keyed solely off years-of-experience: 60_000 + yrs × 3_500. Ignores
// title, location, and industry on purpose. The point is for the
// fallback to be obviously inferior — when the LLM is configured the
// user gets real numbers; when it isn't, they still get a parseable
// response (and the page footer's "AI-Generated Estimates" disclaimer
// covers both cases).
//
// Same formula as the pre-AI stub — kept identical so the
// tools-api.test.ts contract assertions (`y10 - y0 == 35000`,
// `baseline == 60000`) still pin behaviour.
// ---------------------------------------------------------------------------

export interface SalaryAnalysisResponse {
  medianSalary: number;
  estimatedSalary: number;
  salaryRange: { min: number; max: number };
  percentiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  locationAdjustment: number;
  industryComparison: { industry: string; marketPosition: string };
  // Pass-through extras when produced by the LLM. Frontend consumes
  // them opportunistically (see frontend/pages/tools/SalaryCalculator.tsx).
  experienceImpact?: SalaryAnalysisLLM["experienceImpact"];
  skillsPremium?: SalaryAnalysisLLM["skillsPremium"];
  careerGrowth?: SalaryAnalysisLLM["careerGrowth"];
  marketTrends?: SalaryAnalysisLLM["marketTrends"];
  negotiationRange?: SalaryAnalysisLLM["negotiationRange"];
  /** True when the deterministic stub produced this response. */
  fallback?: boolean;
}

export function buildSalaryFallback(input: {
  yearsExperience: number;
  industry?: string;
}): SalaryAnalysisResponse {
  const exp = Math.max(0, input.yearsExperience);
  const base = 60_000 + exp * 3_500;
  const round = Math.round;

  return {
    medianSalary: round(base),
    estimatedSalary: round(base),
    salaryRange: { min: round(base * 0.85), max: round(base * 1.2) },
    percentiles: {
      p10: round(base * 0.7),
      p25: round(base * 0.85),
      p50: round(base),
      p75: round(base * 1.15),
      p90: round(base * 1.3),
    },
    locationAdjustment: 1,
    industryComparison: {
      industry: input.industry?.trim() || "general",
      marketPosition: "competitive",
    },
    fallback: true,
  };
}

/**
 * Project the rich LLM payload into the public response contract,
 * preserving the extra fields as pass-throughs.
 */
function projectLLMResponse(
  llm: SalaryAnalysisLLM,
  industryLabel: string,
): SalaryAnalysisResponse {
  return {
    medianSalary: Math.round(llm.medianSalary),
    estimatedSalary: Math.round(llm.medianSalary),
    salaryRange: {
      min: Math.round(llm.salaryRange.min),
      max: Math.round(llm.salaryRange.max),
    },
    percentiles: {
      p10: Math.round(llm.percentiles.p10),
      p25: Math.round(llm.percentiles.p25),
      p50: Math.round(llm.percentiles.p50),
      p75: Math.round(llm.percentiles.p75),
      p90: Math.round(llm.percentiles.p90),
    },
    locationAdjustment: llm.locationAdjustment.factor,
    industryComparison: {
      industry: industryLabel || "general",
      marketPosition: llm.industryComparison.marketPosition,
    },
    experienceImpact: llm.experienceImpact,
    skillsPremium: llm.skillsPremium,
    careerGrowth: llm.careerGrowth,
    marketTrends: llm.marketTrends,
    negotiationRange: llm.negotiationRange,
  };
}

// ---------------------------------------------------------------------------
// handleAnalyze — POST /api/salarycalculator/analyze
// ---------------------------------------------------------------------------

const ANALYZE_SYSTEM_PROMPT = `You are a compensation analyst. Given a role, location, industry, and experience level, estimate gross annual USD compensation using current US market data.

Output rules:
- Numbers must reflect cost of living for the SPECIFIC city / metro provided. SF Bay Area, NYC, Seattle, LA, Boston run 1.3-1.6× a national baseline. Detroit, Cleveland, Pittsburgh, Phoenix run 0.9-1.0×. Remote-friendly companies often anchor to Tier-1 metro pay.
- Tech, finance, and pharma pay materially above retail, education, and nonprofit at the same seniority — reflect that gap.
- Senior IC titles (Senior / Staff / Principal) compound on years of experience: a Staff Engineer in SF with 10 yrs is in the $250-380K range, not the $90-150K range.
- percentiles must be monotonically non-decreasing: p10 <= p25 <= p50 <= p75 <= p90.
- medianSalary should equal p50.
- salaryRange.min ≈ p25, salaryRange.max ≈ p90 (the spread the candidate would realistically negotiate within).
- locationAdjustment.factor is the multiplicative cost-of-living index vs national baseline (1.0 = on par).
- industryComparison.industryAverage is the median for THIS role in THIS industry across all locations.
- skillsPremium lists 3-5 skills that materially move pay for this role (with the dollar premium each adds).
- Be specific and grounded. Do not return a flat $95K for everyone.

Always return a valid JSON object matching the requested schema.`;

function buildAnalyzeUserMessage(input: SalaryAnalyzeInput): string {
  const parts: string[] = [];
  parts.push(`Job title: ${input.jobTitle || "(unspecified)"}`);
  parts.push(`Location: ${input.location || "(unspecified — assume US national average)"}`);
  parts.push(`Industry: ${input.industry || "(unspecified)"}`);
  parts.push(`Years of experience: ${input.yearsExperience}`);
  if (input.education) parts.push(`Education: ${input.education}`);
  if (input.company) parts.push(`Target company: ${input.company}`);
  parts.push("");
  parts.push(
    "Return JSON with: medianSalary, salaryRange{min,max}, percentiles{p10,p25,p50,p75,p90}, locationAdjustment{factor,description}, industryComparison{industryAverage,marketPosition,topPayingCompanies[]}, experienceImpact{currentLevel,salaryBoost,nextMilestone}, skillsPremium[{skill,premium,demand}], careerGrowth{nextRole,timeframe,salaryIncrease}, marketTrends{trend,growthRate,outlook}, negotiationRange{conservative,target,aggressive}.",
  );
  return parts.join("\n");
}

export async function handleAnalyze(
  deps: SalaryDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  const parsed = SalaryAnalyzeInputSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }
  const input = parsed.data;

  if (!input.jobTitle || !input.location) {
    return fail(
      400,
      "VALIDATION_ERROR",
      "jobTitle and location are required for an accurate estimate.",
    );
  }

  if (deps.llm) {
    try {
      const { data: llmResult } = await deps.llm.callJson(
        "salary_analyze",
        {
          useCase: "salary_estimate",
          systemPrompt: ANALYZE_SYSTEM_PROMPT,
          userMessage: buildAnalyzeUserMessage(input),
          responseFormat: "json_object",
        },
        SalaryAnalysisLLMSchema,
      );
      return ok(projectLLMResponse(llmResult, input.industry));
    } catch (err) {
      // The LLM was configured (deps.llm present) but the CALL threw —
      // do NOT leak the deterministic stub as if it were a real answer.
      // Re-throw so the route boundary maps it through the shared
      // aiFailure() seam (typed AI_* envelope + correlationId). The stub
      // remains only the genuine "no LLM configured" fallback below.
      throw err;
    }
  }

  return ok(buildSalaryFallback(input));
}

// ---------------------------------------------------------------------------
// handleNegotiationTips — POST /api/salarycalculator/negotiation-tips
// ---------------------------------------------------------------------------

const NEGOTIATION_SYSTEM_PROMPT = `You are a senior compensation coach. Given a role, location, current offer, and market rate, produce concrete negotiation strategies and talking points the candidate can use in their next conversation with the recruiter.

Rules:
- 4-6 strategies, each one sentence, action-oriented (e.g. "Anchor on the 75th percentile by citing levels.fyi for this title in this metro").
- 4-6 talking points the candidate can paraphrase verbatim into a recruiter email.
- targetRange: a realistic counter-offer band given currentOffer and marketRate. Set min ~2-5% above the higher of the two; max ~10-15% above. If currentOffer or marketRate is missing, omit targetRange.
- Be specific to the role and metro. Avoid generic advice.
- Always return valid JSON.`;

function buildNegotiationUserMessage(input: SalaryNegotiationInput): string {
  const parts: string[] = [];
  parts.push(`Job title: ${input.jobTitle || "(unspecified)"}`);
  parts.push(`Location: ${input.location || "(unspecified)"}`);
  if (input.industry) parts.push(`Industry: ${input.industry}`);
  if (input.yearsExperience) parts.push(`Years of experience: ${input.yearsExperience}`);
  if (input.currentOffer != null) parts.push(`Current offer (USD/yr): ${input.currentOffer}`);
  if (input.marketRate != null) parts.push(`Market rate (USD/yr): ${input.marketRate}`);
  parts.push("");
  parts.push(
    "Return JSON: { strategies: string[], talkingPoints: string[], targetRange?: { min, max } }",
  );
  return parts.join("\n");
}

function buildNegotiationFallback(input: SalaryNegotiationInput) {
  const anchor =
    input.currentOffer != null && input.marketRate != null
      ? Math.max(input.currentOffer, input.marketRate)
      : (input.currentOffer ?? input.marketRate);

  return {
    strategies: [
      "Lead with market data and role impact.",
      "Anchor your range slightly above your target.",
    ],
    talkingPoints: [
      "Summarize outcomes and measurable impact.",
      "Frame compensation as alignment with current market benchmarks.",
    ],
    targetRange:
      anchor != null
        ? {
            min: Math.round(anchor * 1.02),
            max: Math.round(anchor * 1.12),
          }
        : undefined,
    fallback: true,
  };
}

export async function handleNegotiationTips(
  deps: SalaryDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  const parsed = SalaryNegotiationInputSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }
  const input = parsed.data;

  if (deps.llm) {
    try {
      const { data: llmResult } = await deps.llm.callJson(
        "salary_negotiation",
        {
          useCase: "salary_negotiation",
          systemPrompt: NEGOTIATION_SYSTEM_PROMPT,
          userMessage: buildNegotiationUserMessage(input),
          responseFormat: "json_object",
        },
        NegotiationLLMSchema,
      );
      return ok(llmResult);
    } catch (err) {
      // Configured-but-threw: re-throw so the route maps it through the
      // shared aiFailure() seam instead of leaking the canned stub.
      throw err;
    }
  }

  return ok(buildNegotiationFallback(input));
}
