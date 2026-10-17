/**
 * Request schemas for the agency recruiting surface (/api/recruit +
 * /api/recruit/pitch-decks, gap #99). Routes validate with these; the
 * use cases in this folder take the inferred types.
 */
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";

// ─── candidate_resumes ───────────────────────────────────────────────────────

export const CreateCandidateResumeSchema = z.object({
  companyId: UuidLikeSchema,
  talentPoolCandidateId: UuidLikeSchema.optional(),
  linkedUserId: UuidLikeSchema.optional(),
  mergedFromUserResumeId: UuidLikeSchema.optional(),
  parentId: UuidLikeSchema.optional(),
  label: z.string().max(255).optional(),
  content: z.record(z.string(), z.unknown()).default({}),
  recruiterNotes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});
export type CreateCandidateResumeInput = z.infer<typeof CreateCandidateResumeSchema>;

export const UpdateCandidateResumeSchema = z.object({
  label: z.string().max(255).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  recruiterNotes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateCandidateResumeInput = z.infer<typeof UpdateCandidateResumeSchema>;

/**
 * Bulk CSV import (closes audit gap #1 — CSV import was missing, only
 * JSON-paste worked). Each row becomes a thin JSON Resume.
 */
export const BulkCsvRowSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  label: z.string().max(200).optional().nullable(),
  skills: z.array(z.string()).optional().nullable(),
});
export const BulkCsvSchema = z.object({
  companyId: UuidLikeSchema,
  rows: z.array(BulkCsvRowSchema).min(1).max(500),
});
export type BulkCsvInput = z.infer<typeof BulkCsvSchema>;

// ─── redaction_profiles ──────────────────────────────────────────────────────

export const CreateRedactionProfileSchema = z.object({
  companyId: UuidLikeSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  hideName: z.boolean().optional(),
  hideEmail: z.boolean().optional(),
  hidePhone: z.boolean().optional(),
  hideAddress: z.boolean().optional(),
  hideLinkedin: z.boolean().optional(),
  hideOtherUrls: z.boolean().optional(),
  hideAvatar: z.boolean().optional(),
  replacementName: z.string().max(100).optional(),
  hideCompanyNames: z.boolean().optional(),
  hideSchoolNames: z.boolean().optional(),
  extraStripPaths: z.array(z.string()).optional(),
});
export type CreateRedactionProfileInput = z.infer<typeof CreateRedactionProfileSchema>;

export const UpdateRedactionProfileSchema = CreateRedactionProfileSchema.omit({
  companyId: true,
}).partial();
export type UpdateRedactionProfileInput = z.infer<typeof UpdateRedactionProfileSchema>;

// ─── candidate résumé shares (share_links, candidate_resume) ────────────────

export const CreateShareSchema = z.object({
  companyId: UuidLikeSchema,
  candidateResumeId: UuidLikeSchema,
  redactionProfileId: UuidLikeSchema.optional(),
  whitelabelTenantId: UuidLikeSchema.optional(),
  name: z.string().max(255).optional(),
  recipientEmail: z.string().email().optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateShareInput = z.infer<typeof CreateShareSchema>;

export const UpdateShareSchema = z.object({
  name: z.string().max(255).optional(),
  recipientEmail: z.string().email().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateShareInput = z.infer<typeof UpdateShareSchema>;

// ─── pitch_decks ─────────────────────────────────────────────────────────────

export const CreateDeckSchema = z.object({
  companyId: UuidLikeSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  jobId: UuidLikeSchema.optional(),
  whitelabelTenantId: UuidLikeSchema.optional(),
  redactionProfileId: UuidLikeSchema.optional(),
  status: z.enum(["draft", "sent", "archived"]).optional(),
});
export type CreateDeckInput = z.infer<typeof CreateDeckSchema>;

export const UpdateDeckSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  jobId: UuidLikeSchema.nullable().optional(),
  whitelabelTenantId: UuidLikeSchema.nullable().optional(),
  redactionProfileId: UuidLikeSchema.nullable().optional(),
  status: z.enum(["draft", "sent", "archived"]).optional(),
});
export type UpdateDeckInput = z.infer<typeof UpdateDeckSchema>;

export const AddSlideSchema = z.object({
  candidateResumeId: UuidLikeSchema,
  displayOrder: z.number().int().min(0).optional(),
  redactionProfileId: UuidLikeSchema.optional(),
  fitSummary: z.string().optional(),
  matchScore: z.number().int().min(0).max(100).optional(),
  recruiterNotes: z.string().optional(),
});
export type AddSlideInput = z.infer<typeof AddSlideSchema>;

export const UpdateSlideSchema = z.object({
  displayOrder: z.number().int().min(0).optional(),
  redactionProfileId: UuidLikeSchema.nullable().optional(),
  fitSummary: z.string().nullable().optional(),
  matchScore: z.number().int().min(0).max(100).nullable().optional(),
  recruiterNotes: z.string().nullable().optional(),
});
export type UpdateSlideInput = z.infer<typeof UpdateSlideSchema>;

export const CreateDeckShareSchema = z.object({
  recipientName: z.string().max(255).optional(),
  recipientEmail: z.string().email().optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateDeckShareInput = z.infer<typeof CreateDeckShareSchema>;

export const UpdateDeckShareSchema = z.object({
  recipientName: z.string().max(255).optional(),
  recipientEmail: z.string().email().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDeckShareInput = z.infer<typeof UpdateDeckShareSchema>;
