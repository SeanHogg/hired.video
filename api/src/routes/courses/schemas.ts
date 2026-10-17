/**
 * Zod request schemas for the /api/courses sub-routers. The exported
 * learner/lesson schemas are re-exported from routes/courses.ts (pinned by
 * routes/__tests__/courses-schemas.test.ts).
 */
import { z } from "zod";
import {
  COURSE_LESSON_SOURCE_TYPES,
  COURSE_DIFFICULTIES,
  SCORM_VERSIONS,
} from "../../db/schema/courses.js";
import { SCORM_COMPLETION_STATUSES } from "../../db/schema/learning.js";
import { UuidLikeSchema } from "../../../../shared/validation.js";

// #2150 — accept EITHER an absolute http(s) URL OR a leading-slash relative
// path (e.g. `/api/og/courses?…` cover URLs the migration-0190 seed writes).
const coverImageUrlSchema = z
  .string()
  .refine(
    (v) => v.startsWith("/") || /^https?:\/\//.test(v),
    "Must be an absolute URL or a root-relative path",
  )
  .optional();

export const CreateCourseSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().max(1000).optional(),
  description: z.string().optional(),
  coverImageUrl: coverImageUrlSchema,
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  difficulty: z.enum(COURSE_DIFFICULTIES).optional(),
  estimatedMinutes: z.number().int().min(0).max(100_000).optional(),
  // #2068 GAP-1 — structured outcome / requirement bullet lists.
  learningOutcomes: z.array(z.string().min(1).max(200)).max(20).optional(),
  requirements: z.array(z.string().min(1).max(200)).max(20).optional(),
  priceCents: z.number().int().min(0).optional(),
  priceVisible: z.boolean().optional(),
  issuesCertificate: z.boolean().optional(),
  passingScorePct: z.number().int().min(0).max(100).optional(),
  /** #1501 — studio_template marketplace row supplying the SCORM player
   *  chrome tokens + course-card branding. */
  themeId: UuidLikeSchema.nullable().optional(),
  /** #1501 — Override map merged over the themeId base. Whitelisted
   *  string keys + values to prevent payload-bomb / XSS via CSS vars. */
  themeTokens: z.record(z.string().max(64), z.string().max(256)).nullable().optional(),
});

export const UpdateCourseSchema = CreateCourseSchema.partial().extend({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),
  /** #1502 — assignee for the in_review queue. */
  assignedReviewerId: UuidLikeSchema.nullable().optional(),
});

/** #1502 — submit-for-review body. */
export const SubmitForReviewSchema = z.object({
  assignedReviewerId: UuidLikeSchema.nullable().optional(),
});

export const CreateModuleSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const UpdateModuleSchema = CreateModuleSchema.partial();

export const CreateLessonSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().optional(),
  moduleId: UuidLikeSchema.optional(),
  sourceType: z.enum(COURSE_LESSON_SOURCE_TYPES),
  studioProjectId: z.string().optional(),
  scormManifestUrl: z.string().url().optional(),
  scormEntryUrl: z.string().url().optional(),
  scormVersion: z.enum(SCORM_VERSIONS).optional(),
  // #1440 — uuid of the R2 prefix that wraps every file in a SCORM
  // package. Recorded on insert so the DELETE handler can bulk-clean.
  scormPkgId: UuidLikeSchema.optional(),
  externalUrl: z.string().url().optional(),
  bodyMd: z.string().optional(),
  // Tiptap JSON kept in lockstep with bodyMd (#1569).
  bodyJson: z.unknown().optional(),
  estimatedMinutes: z.number().int().min(0).max(100_000).optional(),
  isRequired: z.boolean().optional(),
  knowledgeCheckFormId: UuidLikeSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const UpdateLessonSchema = CreateLessonSchema.partial();

export const ProgressUpdateSchema = z.object({
  lessonId: UuidLikeSchema,
  status: z.enum(["not_started", "in_progress", "passed", "failed"]),
  scoreRaw: z.number().optional(),
  scoreMax: z.number().optional(),
  timeSpentSec: z.number().int().min(0).optional(),
});

export const PrerequisiteSchema = z.object({
  prerequisiteCourseId: UuidLikeSchema,
});

export const ScormCommitSchema = z.object({
  lessonId: UuidLikeSchema,
  scormVersion: z.enum(SCORM_VERSIONS),
  cmi: z.record(z.string(), z.unknown()),
  completionStatus: z.enum(SCORM_COMPLETION_STATUSES).optional(),
  scoreRaw: z.number().optional(),
  scoreMin: z.number().optional(),
  scoreMax: z.number().optional(),
  totalTimeSec: z.number().int().min(0).optional(),
  suspendData: z.string().optional(),
});
