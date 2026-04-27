/**
 * Zod input schemas + branded enum types for the scorecards bounded
 * context. Lives in the domain module so route layer, service layer,
 * and tests can all share one source of truth for request shapes.
 */

import { z } from "zod";

export const RatingScaleEnum = z.enum(["1-4", "1-5", "thumbs", "yes-no"]);
export type RatingScale = z.infer<typeof RatingScaleEnum>;

export const RecommendationEnum = z.enum(["strong_yes", "yes", "no", "strong_no"]);
export type Recommendation = z.infer<typeof RecommendationEnum>;

export const DecisionEnum = z.enum(["approve", "reject", "hold", "withdraw"]);
export type Decision = z.infer<typeof DecisionEnum>;

export const SubmissionStatusEnum = z.enum(["draft", "submitted"]);
export type SubmissionStatus = z.infer<typeof SubmissionStatusEnum>;

// ─── Templates + attributes ──────────────────────────────────────────────────

export const AttributeInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  displayOrder: z.number().int().min(0).default(0),
  weight: z.number().int().min(1).max(10).default(1),
  anchors: z.record(z.string(), z.string()).optional(),
});
// `z.input` (not `z.infer`) so callers can omit fields that have a default —
// e.g. `weight`, `displayOrder` here. After `safeParse` the parsed `data`
// uses `z.infer` (output type) where defaults are filled in.
export type AttributeInput = z.input<typeof AttributeInputSchema>;

export const CreateTemplateSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  ratingScale: RatingScaleEnum.default("1-4"),
  roleFamily: z.string().max(100).optional(),
  attributes: z.array(AttributeInputSchema).min(1).max(20),
});
export type CreateTemplateInput = z.input<typeof CreateTemplateSchema>;

export const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  ratingScale: RatingScaleEnum.optional(),
  roleFamily: z.string().max(100).nullable().optional(),
  isArchived: z.boolean().optional(),
});
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;

// ─── Interview kits + stages ─────────────────────────────────────────────────

export const StageInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  displayOrder: z.number().int().min(0).default(0),
  durationMinutes: z.number().int().min(5).max(480).default(60),
  suggestedQuestions: z.array(z.string()).optional(),
  scorecardTemplateId: z.string().uuid().optional(),
});
export type StageInput = z.input<typeof StageInputSchema>;

export const CreateKitSchema = z.object({
  companyId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  stages: z.array(StageInputSchema).min(1).max(15),
});
export type CreateKitInput = z.input<typeof CreateKitSchema>;

export const UpdateKitSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
  isArchived: z.boolean().optional(),
});
export type UpdateKitInput = z.infer<typeof UpdateKitSchema>;

// ─── Submissions ─────────────────────────────────────────────────────────────

export const RatingInputSchema = z.object({
  attributeId: z.string().uuid(),
  rating: z.number().int().min(0).max(10).nullable(),
  notes: z.string().max(2000).optional(),
});
export type RatingInput = z.infer<typeof RatingInputSchema>;

export const CreateSubmissionSchema = z.object({
  templateId: z.string().uuid(),
  applicationId: z.string().min(1),
  interviewId: z.string().uuid().optional(),
  kitStageId: z.string().uuid().optional(),
  candidateUserId: z.string().uuid().optional(),
  ratings: z.array(RatingInputSchema).optional(),
  overallRecommendation: RecommendationEnum.optional(),
  summary: z.string().max(5000).optional(),
  strengths: z.string().max(5000).optional(),
  concerns: z.string().max(5000).optional(),
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
  companyId: z.string().uuid(),
  applicationId: z.string().min(1),
  jobId: z.string().uuid().optional(),
  candidateUserId: z.string().uuid().optional(),
  decision: DecisionEnum,
  reason: z.string().max(2000).optional(),
});
export type CreateDecisionInput = z.infer<typeof CreateDecisionSchema>;
