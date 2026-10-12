/**
 * Zod input schemas + branded enum types for the scorecards bounded
 * context. Lives in the domain module so route layer, service layer,
 * and tests can all share one source of truth for request shapes.
 */

import { z } from "zod";

import { UuidLikeSchema } from "../../../../shared/validation.js";
export const RatingScaleEnum = z.enum(["1-4", "1-5", "thumbs", "yes-no"]);
export type RatingScale = z.infer<typeof RatingScaleEnum>;

export const RecommendationEnum = z.enum(["strong_yes", "yes", "no", "strong_no"]);
export type Recommendation = z.infer<typeof RecommendationEnum>;

export const DecisionEnum = z.enum(["approve", "reject", "hold", "withdraw"]);
export type Decision = z.infer<typeof DecisionEnum>;

export const SubmissionStatusEnum = z.enum(["draft", "submitted"]);
export type SubmissionStatus = z.infer<typeof SubmissionStatusEnum>;

// Migration 0132 / gap #1380. Kit-level blind-review policy. Validated at
// the Zod layer rather than a CHECK constraint so new modes can land
// without a schema migration.
export const BlindReviewModeEnum = z.enum([
  "off",
  "anonymize_candidate",
  "hide_peer_scorecards",
  "both",
]);
export type BlindReviewMode = z.infer<typeof BlindReviewModeEnum>;

// Migration 0132 / gap #1386. Drives which candidate-facing surface +
// reviewer UI a stage hands off to.
export const StageKindEnum = z.enum([
  "interview",
  "async_video",
  "take_home",
  "assessment",
]);
export type StageKind = z.infer<typeof StageKindEnum>;

// Migration 0132 / gap #1382. Coarse-grained classification — used to
// drive filtering + cross-template analytics roll-ups.
export const CompetencyTaxonomyEnum = z.enum([
  "technical",
  "behavioral",
  "leadership",
  "execution",
  "other",
]);
export type CompetencyTaxonomy = z.infer<typeof CompetencyTaxonomyEnum>;

// ─── Competency framework (#1382) ────────────────────────────────────────────

export const CompetencyLevelInputSchema = z.object({
  level: z.number().int().min(1).max(20),
  label: z.string().min(1).max(100),
  anchor: z.string().min(1).max(2000),
});
export type CompetencyLevelInput = z.infer<typeof CompetencyLevelInputSchema>;

export const CreateCompetencySchema = z.object({
  companyId: UuidLikeSchema,
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  taxonomy: CompetencyTaxonomyEnum.default("other"),
  levels: z.array(CompetencyLevelInputSchema).min(0).max(20).default([]),
});
export type CreateCompetencyInput = z.input<typeof CreateCompetencySchema>;

export const UpdateCompetencySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  taxonomy: CompetencyTaxonomyEnum.optional(),
  isArchived: z.boolean().optional(),
});
export type UpdateCompetencyInput = z.infer<typeof UpdateCompetencySchema>;

// ─── Templates + attributes ──────────────────────────────────────────────────

export const AttributeInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  displayOrder: z.number().int().min(0).default(0),
  weight: z.number().int().min(1).max(10).default(1),
  anchors: z.record(z.string(), z.string()).optional(),
  // Migration 0132 / gap #1382. Optional link to a competency in the
  // reusable rubric library. Free-form attributes (null) remain valid.
  competencyId: UuidLikeSchema.nullable().optional(),
});
// `z.input` (not `z.infer`) so callers can omit fields that have a default —
// e.g. `weight`, `displayOrder` here. After `safeParse` the parsed `data`
// uses `z.infer` (output type) where defaults are filled in.
export type AttributeInput = z.input<typeof AttributeInputSchema>;

export const CreateTemplateSchema = z.object({
  companyId: UuidLikeSchema,
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  ratingScale: RatingScaleEnum.default("1-4"),
  roleFamily: z.string().max(100).optional(),
  /** Migration 0134 / gap #1384. Optional cert gate. */
  requiredCertificationCourseId: UuidLikeSchema.nullable().optional(),
  attributes: z.array(AttributeInputSchema).min(1).max(20),
});
export type CreateTemplateInput = z.input<typeof CreateTemplateSchema>;

export const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  ratingScale: RatingScaleEnum.optional(),
  roleFamily: z.string().max(100).nullable().optional(),
  requiredCertificationCourseId: UuidLikeSchema.nullable().optional(),
  isArchived: z.boolean().optional(),
});
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;

// ─── Interview kits + stages ─────────────────────────────────────────────────

export const StageInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  // Migration 0132 / gap #1386. Defaults to 'interview' to keep existing
  // kit-create requests working unchanged.
  stageKind: StageKindEnum.default("interview"),
  displayOrder: z.number().int().min(0).default(0),
  durationMinutes: z.number().int().min(5).max(480).default(60),
  suggestedQuestions: z.array(z.string()).optional(),
  scorecardTemplateId: UuidLikeSchema.optional(),
});
export type StageInput = z.input<typeof StageInputSchema>;

export const CreateKitSchema = z.object({
  companyId: UuidLikeSchema,
  jobId: UuidLikeSchema.optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  // Migration 0132 / gap #1380. Default 'off' — opt-in policy.
  blindReviewMode: BlindReviewModeEnum.default("off"),
  // Migration 0132 / gap #1383. Optional escalation recipient for SLA
  // breaches.
  escalateToUserId: UuidLikeSchema.nullable().optional(),
  stages: z.array(StageInputSchema).min(1).max(15),
});
export type CreateKitInput = z.input<typeof CreateKitSchema>;

export const UpdateKitSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  jobId: UuidLikeSchema.nullable().optional(),
  blindReviewMode: BlindReviewModeEnum.optional(),
  escalateToUserId: UuidLikeSchema.nullable().optional(),
  isArchived: z.boolean().optional(),
});
export type UpdateKitInput = z.infer<typeof UpdateKitSchema>;

// ─── Submissions ─────────────────────────────────────────────────────────────

export const RatingInputSchema = z.object({
  attributeId: UuidLikeSchema,
  rating: z.number().int().min(0).max(10).nullable(),
  notes: z.string().max(2000).optional(),
});
export type RatingInput = z.infer<typeof RatingInputSchema>;

export const CreateSubmissionSchema = z.object({
  templateId: UuidLikeSchema,
  applicationId: z.string().min(1),
  interviewId: UuidLikeSchema.optional(),
  kitStageId: UuidLikeSchema.optional(),
  candidateUserId: UuidLikeSchema.optional(),
  ratings: z.array(RatingInputSchema).optional(),
  overallRecommendation: RecommendationEnum.optional(),
  summary: z.string().max(5000).optional(),
  strengths: z.string().max(5000).optional(),
  concerns: z.string().max(5000).optional(),
  // Migration 0132 / gap #1383. Soft deadline; the reminder worker scans
  // for drafts with dueAt approaching.
  dueAt: z
    .union([z.string().datetime(), z.date()])
    .transform((v) => (typeof v === "string" ? new Date(v) : v))
    .optional(),
});
export type CreateSubmissionInput = z.infer<typeof CreateSubmissionSchema>;

export const UpdateSubmissionSchema = z.object({
  ratings: z.array(RatingInputSchema).optional(),
  overallRecommendation: RecommendationEnum.optional(),
  summary: z.string().max(5000).nullable().optional(),
  strengths: z.string().max(5000).nullable().optional(),
  concerns: z.string().max(5000).nullable().optional(),
});
export type UpdateSubmissionInput = z.infer<typeof UpdateSubmissionSchema>;

// ─── Decisions ───────────────────────────────────────────────────────────────

export const CreateDecisionSchema = z.object({
  companyId: UuidLikeSchema,
  applicationId: z.string().min(1),
  jobId: UuidLikeSchema.optional(),
  candidateUserId: UuidLikeSchema.optional(),
  decision: DecisionEnum,
  reason: z.string().max(2000).optional(),
});
export type CreateDecisionInput = z.infer<typeof CreateDecisionSchema>;
