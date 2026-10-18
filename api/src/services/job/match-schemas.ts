/**
 * Match-domain request / response schemas + lenient LLM ingest specs.
 * Split out of match-handlers.ts (now a re-export facade).
 */
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { defineLenientIngest } from "../../services/adapters/llm-client.js";
import { coerceEnum } from "../../services/adapters/lenient-coerce.js";
import { coerceToString } from "./tailor-edit-contract.js";
import { AnalyzeSkillsSchema } from "./match-skills.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const MatchInputSchema = z
  .object({
    jobHtml: z.string().optional(),
    jobId: UuidLikeSchema.optional(),
    resumeId: UuidLikeSchema.optional(),
  })
  .refine((v) => !!(v.jobHtml || v.jobId), {
    message: "Either jobHtml or jobId is required",
  });

export const MatchByContentSchema = z.object({
  jobContent: z.string().min(1),
  resumeContent: z.string().min(1),
});

export const MatchByIdSchema = z.object({
  jobId: UuidLikeSchema,
  resumeId: UuidLikeSchema,
});

export const MatchInsightsSchema = z.object({
  jobHtml: z.string().min(1),
  resumeId: UuidLikeSchema.optional(),
});

export const AnalyzeResponseSchema = z.object({
  score: z.number().min(0).max(100),
  summaryRecommendations: coerceToString,
});

/** /analyze only: the same call also names matched / missing skills. */
export const AnalyzeWithSkillsResponseSchema = AnalyzeResponseSchema.extend(AnalyzeSkillsSchema.shape);

export const InsightsResponseSchema = z.object({
  overallFit: z.enum(["strong", "good", "fair", "weak"]),
  seniorityFit: z.string(),
  missingSkills: z.array(
    z.object({
      skill: z.string(),
      category: z.string(),
      importance: z.enum(["critical", "important", "nice-to-have"]),
    }),
  ),
  careerTrajectory: z.string(),
  interviewTips: z.array(z.string()),
  suggestedCertifications: z.array(z.object({ name: z.string(), reason: z.string() })),
  estimatedRampTime: z.string(),
});

// ─── Lenient ingest specs ─────────────────────────────────────────────────
//
// Free-tier models drift on the strict enums baked into InsightsResponse
// (`overallFit`, `missingSkills.importance`). Each spec owns a lenient wire
// schema where the drift-prone fields accept `string`, plus a `coerce` step
// that maps any free-form value onto a canonical bucket via the shared
// `coerceEnum` helper. The strict canonical schemas (above) stay in place at
// the storage / wire boundary — handlers receive the canonical shape from
// `callJsonLenient`.

const FIT_ALLOWED = ["strong", "good", "fair", "weak"] as const;
const FIT_ALIASES: Record<string, (typeof FIT_ALLOWED)[number]> = {
  excellent: "strong", great: "strong", high: "strong", veryhigh: "strong",
  ok: "good", okay: "good", solid: "good", moderate: "good", decent: "good", medium: "good",
  average: "fair", borderline: "fair", marginal: "fair",
  poor: "weak", low: "weak", bad: "weak", verylow: "weak", mismatch: "weak",
};

const SKILL_IMPORTANCE_ALLOWED = ["critical", "important", "nice-to-have"] as const;
const SKILL_IMPORTANCE_ALIASES: Record<string, (typeof SKILL_IMPORTANCE_ALLOWED)[number]> = {
  must: "critical", musthave: "critical", required: "critical", high: "critical", urgent: "critical",
  preferred: "important", medium: "important", moderate: "important", desired: "important",
  optional: "nice-to-have", low: "nice-to-have", bonus: "nice-to-have", nicetohave: "nice-to-have",
};

const LenientInsightsResponseSchema = z.object({
  overallFit: z.string().min(1),
  seniorityFit: z.string(),
  missingSkills: z.array(
    z.object({
      skill: z.string(),
      category: z.string(),
      importance: z.string().min(1),
    }),
  ),
  careerTrajectory: z.string(),
  interviewTips: z.array(z.string()),
  suggestedCertifications: z.array(z.object({ name: z.string(), reason: z.string() })),
  estimatedRampTime: z.string(),
});

export const InsightsResponseIngest = defineLenientIngest({
  name: "MatchInsightsResponse",
  ingest: LenientInsightsResponseSchema,
  coerce: (wire): z.infer<typeof InsightsResponseSchema> => ({
    ...wire,
    overallFit: coerceEnum(wire.overallFit, {
      allowed: FIT_ALLOWED,
      aliases: FIT_ALIASES,
      fallback: "fair",
    }),
    missingSkills: wire.missingSkills.map((s) => ({
      ...s,
      importance: coerceEnum(s.importance, {
        allowed: SKILL_IMPORTANCE_ALLOWED,
        aliases: SKILL_IMPORTANCE_ALIASES,
        fallback: "important",
      }),
    })),
  }),
});
