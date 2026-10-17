/**
 * Zod schemas for the /api/jobs write surface. Re-exported from
 * routes/jobs.ts (routes/__tests__/jobs-schemas.test.ts imports them there).
 */
import { z } from "zod";
import { OptionalUrlSchema, UuidLikeSchema } from "../../../../shared/validation.js";

export const CreateJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  location: z.string().optional(),
  heroImageUrl: OptionalUrlSchema,
  /** #743 — Optional Studio Project attached to the job. */
  videoProjectId: z.string().uuid().optional().nullable(),
  /** Required-skills list. Persisted to `job_items.skills_required` (jsonb).
   *  The wire field is `skills` to match the read shape (`rowToJob`
   *  exposes `row.skillsRequired` as `skills`). The 2026-05-04 fix:
   *  prior to this entry, Zod silently stripped the field on PUT so the
   *  Skill Extractor's "Add to Job" button looked successful (200 OK)
   *  but never persisted anything. */
  skills: z.array(z.string()).optional(),
  /** AI-resilient sector slug. See `shared/sectors.ts`. Same lesson
   *  as the skills field above — must be declared here or Zod strips
   *  it at the route boundary and the service never sees it. */
  sector: z.string().max(64).optional(),
  // ---- Editable surface widened in #878 ----
  // The whole job create/edit form ships these; before this they were
  // silently stripped by Zod's default unknown-key removal, so a PUT
  // returned 200 but persisted nothing. `jobService.buildJobColumnPatch`
  // is the single source of truth that maps each to its `job_items`
  // column (or the `details` jsonb bag). Keep this list and that mapper
  // in lockstep.
  company: z.string().max(255).optional(),
  // (Studio document-canvas hero image #2218 is declared once above as
  // `heroImageUrl: OptionalUrlSchema` — the duplicate stale lenient copy that
  // used to sit here was removed 2026-06-27; it silently overrode the
  // OptionalUrlSchema validation, so `""` was persisted instead of cleared.)
  responsibilities: z.array(z.string()).optional(),
  requirements: z.array(z.string()).optional(),
  qualifications: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  // Accept single-or-array, any of the three legacy spellings — the
  // mapper normalizes to the canonical kebab value (shared/employment-types).
  employmentType: z.union([z.string(), z.array(z.string())]).optional(),
  seniority: z.union([z.string(), z.array(z.string())]).optional(),
  experienceLevel: z.string().optional(),
  workSetting: z.string().optional(),
  // Hybrid weekly split (#2069). Clamped to [0,7] by the service; only
  // persisted when workSetting resolves to 'hybrid'.
  onsiteDaysPerWeek: z.number().int().min(0).max(7).optional().nullable(),
  remoteDaysPerWeek: z.number().int().min(0).max(7).optional().nullable(),
  isRemote: z.boolean().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  currency: z.string().max(10).optional(),
  applyUrl: OptionalUrlSchema,
  expirationDate: z.string().optional(),
  status: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export const UpdateJobSchema = CreateJobSchema.partial();

export const JobAlertSchema = z.object({
  name: z.string().min(1),
  keywords: z.string().optional(),
  location: z.string().optional(),
  jobType: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
});

/** PUT /:id/screening body. */
export const JobScreeningSchema = z.object({
  questionSetId: UuidLikeSchema.nullable(),
  screeningRequired: z.enum(["none", "optional", "required"]),
});
