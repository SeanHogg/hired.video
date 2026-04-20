/**
 * Shared resume contract — single source of truth for both the Hono API
 * and the React frontend. Zod schemas define the wire format; TS types
 * are inferred. camelCase throughout, aligned with the JSON Resume spec
 * (https://jsonresume.org/schema/).
 *
 * Design rules:
 * - Wire format mirrors the `resume_information` DB row, with `content`
 *   holding the JSON Resume document. No shim, no duplicated fields, no
 *   fake placeholders.
 * - Viewer-specific fields (isOwner, isWatched) are computed per-request
 *   on the server so the frontend doesn't re-derive them.
 * - `viewCount` is aggregated from the `resume_views` event table.
 * - `sentimentScore` is persisted by the sentiment tool when it runs.
 *
 * ─── REFACTOR PROGRESS (living doc) ──────────────────────────────────────
 *
 * DONE (this PR):
 *   - Contract defined (this file).
 *   - DB: `sentiment_score` column on resume_information; `resume_views`
 *     event table; unique(viewer_id, resume_id) on watched_resumes.
 *     Migration: api/drizzle/0022_resume_sentiment_and_views.sql.
 *   - Backend serializers: `rowToResume` + `rowToResumeSummary` are pure
 *     functions returning canonical Resume / ResumeSummary shapes.
 *   - Backend helpers: `computeViewerExtras(Batch)`, `recordResumeView`,
 *     `persistSentimentScore`, `hashClientIp`.
 *   - GET /:id, /public/:slug: record view + real isWatched + real
 *     viewCount. List handlers use the batched helper.
 *   - PUT /:id: slug moved from query string to body, validated by the
 *     SlugSchema below (closes the 2026-04-19 UUID-slug bug).
 *   - POST /sentimentprediction: persists score when `resumeId` is
 *     provided.
 *   - Frontend resume-service: getResumeById / getPublicResume /
 *     getResumeForEmbed are now passthroughs validated by ResumeSchema;
 *     updateResumeData sends slug in body, never as query string.
 *   - Tests: 38 backend tests for serializers + contract, 6 frontend
 *     passthrough tests. All 381 backend + 212 resume-adjacent frontend
 *     tests pass.
 *
 * PENDING (follow-up PRs):
 *   - Services: resume-parse.ts still carries dual-case (ciGet/normalizeJsonResume)
 *     fallbacks; now that content is always camelCase on read, those can
 *     collapse to direct property access.
 *   - resume-merge.ts, resume-diff.ts, skill-extraction.ts use content
 *     fields and tolerate both cases; simplify once storage is fully
 *     migrated.
 *   - Companies: rowToCompanyProfile (api/src/routes/companies.ts:44) is
 *     pure stub fiction — hardcoded benefit flags, empty culture arrays.
 *     Delete or wire to real data.
 *   - Frontend transformApiResumeToResume (resume-service.ts:925+) still
 *     referenced by list methods (getUserResumes, getResumes) — those
 *     methods need migration to passthrough, then the 400-line function
 *     can be deleted.
 *   - Frontend components read PascalCase content keys in ~23 files:
 *     ResumeBuilder, DeclarativeResumeRenderer, resume-exporters,
 *     EmbeddedResume, VideoResumeWizardStep1, MetadataModal, and the
 *     sample-resume / fakeData fixtures. All need camelCase migration.
 *   - E2E route tests: add tests that exercise the full create → watch →
 *     view-from-anonymous → check-counts flow once a test-DB harness
 *     lands (currently we only have pure function tests).
 *
 * ─────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-user vanity URL segment. Lowercase alnum + hyphens, 3–64 chars,
 *  not UUID-shaped (UUIDs identify resumes by id, slugs are the pretty
 *  alternative). Reject leading/trailing/double hyphens. */
export const SlugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(64, "Slug must be at most 64 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers, single hyphens only")
  .refine((s) => !UUID_RE.test(s), "Slug must not look like a UUID");

export const ResumePrivacySchema = z.enum([
  "public",
  "recruiter_only",
  "connections",
  "private",
  "draft",
]);
export type ResumePrivacy = z.infer<typeof ResumePrivacySchema>;

export const ResumeStatusSchema = z.enum(["draft", "published", "archived"]);
export type ResumeStatus = z.infer<typeof ResumeStatusSchema>;

// ---------------------------------------------------------------------------
// JSON Resume content — camelCase, aligned with jsonresume.org/schema
// ---------------------------------------------------------------------------

export const LocationSchema = z.object({
  address: z.string().default("").optional(),
  postalCode: z.string().default("").optional(),
  city: z.string().default("").optional(),
  countryCode: z.string().default("").optional(),
  region: z.string().default("").optional(),
});
export type Location = z.infer<typeof LocationSchema>;

export const BasicsSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  label: z.string().default(""),
  image: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  url: z.string().default(""),
  summary: z.string().default(""),
  location: LocationSchema.nullable().optional(),
});
export type Basics = z.infer<typeof BasicsSchema>;

export const WorkSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  position: z.string().default(""),
  url: z.string().default(""),
  summary: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  highlights: z.array(z.string()).default([]),
});
export type Work = z.infer<typeof WorkSchema>;

export const VolunteerSchema = z.object({
  id: z.string().optional(),
  organization: z.string().default(""),
  position: z.string().default(""),
  url: z.string().default(""),
  summary: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  highlights: z.array(z.string()).default([]),
});
export type Volunteer = z.infer<typeof VolunteerSchema>;

export const EducationSchema = z.object({
  id: z.string().optional(),
  institution: z.string().default(""),
  area: z.string().default(""),
  studyType: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  score: z.string().default(""),
  url: z.string().default(""),
  courses: z.array(z.string()).default([]),
});
export type Education = z.infer<typeof EducationSchema>;

export const AwardSchema = z.object({
  id: z.string().optional(),
  title: z.string().default(""),
  date: z.string().default(""),
  awarder: z.string().default(""),
  summary: z.string().default(""),
});
export type Award = z.infer<typeof AwardSchema>;

export const CertificateSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  date: z.string().default(""),
  issuer: z.string().default(""),
  url: z.string().default(""),
});
export type Certificate = z.infer<typeof CertificateSchema>;

export const PublicationSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  publisher: z.string().default(""),
  releaseDate: z.string().default(""),
  url: z.string().default(""),
  summary: z.string().default(""),
});
export type Publication = z.infer<typeof PublicationSchema>;

export const SkillSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  level: z.string().default(""),
  keywords: z.array(z.string()).default([]),
});
export type Skill = z.infer<typeof SkillSchema>;

export const LanguageSchema = z.object({
  id: z.string().optional(),
  language: z.string().default(""),
  fluency: z.string().default(""),
});
export type Language = z.infer<typeof LanguageSchema>;

export const InterestSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  keywords: z.array(z.string()).default([]),
});
export type Interest = z.infer<typeof InterestSchema>;

export const ReferenceSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  reference: z.string().default(""),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const ProjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  description: z.string().default(""),
  url: z.string().default(""),
  entity: z.string().default(""),
  type: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  highlights: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  roles: z.array(z.string()).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Renderer-level settings (assigned template id, version, etc.). Opaque
 *  bag; the frontend reads and writes without caring about its contents. */
export const ResumeMetaSchema = z.object({
  template: z.string().optional(),
  embeddedTemplate: z.string().optional(),
  version: z.string().optional(),
  lastModified: z.string().optional(),
}).catchall(z.unknown());
export type ResumeMeta = z.infer<typeof ResumeMetaSchema>;

/** Media attachment types for ResumeSectionMeta. The values below were
 *  historically stored as integers on `content.metaData[i].metaType`;
 *  kept intact so legacy rows and the Chrome extension's payloads stay
 *  compatible. Import as a runtime value (`MetaType.VideoMP4`). */
export const MetaType = {
  Hyperlink: 0,
  VideoMP4: 1,
  VideoWebM: 2,
  Image: 5,
  YouTube: 10,
  HtmlContent: 15,
} as const;
export type MetaType = (typeof MetaType)[keyof typeof MetaType];

export const MetaTypeSchema = z.union([
  z.literal(MetaType.Hyperlink),
  z.literal(MetaType.VideoMP4),
  z.literal(MetaType.VideoWebM),
  z.literal(MetaType.Image),
  z.literal(MetaType.YouTube),
  z.literal(MetaType.HtmlContent),
]);

/** Media attachment entry — binds an asset (video/image/link) to a
 *  specific section item via `referenceId` (the item's `id`). */
export const ResumeSectionMetaSchema = z.object({
  id: z.string(),
  userId: z.string(),
  referenceId: z.string(),
  name: z.string().default(""),
  metaType: MetaTypeSchema,
  url: z.string().default(""),
  description: z.string().optional(),
  createdAt: z.string().optional(),
});
export type ResumeSectionMeta = z.infer<typeof ResumeSectionMetaSchema>;

/** The full JSON Resume document stored in `resume_information.content`. */
export const ResumeContentSchema = z.object({
  basics: BasicsSchema.optional(),
  work: z.array(WorkSchema).default([]),
  volunteer: z.array(VolunteerSchema).default([]),
  education: z.array(EducationSchema).default([]),
  awards: z.array(AwardSchema).default([]),
  certificates: z.array(CertificateSchema).default([]),
  publications: z.array(PublicationSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  languages: z.array(LanguageSchema).default([]),
  interests: z.array(InterestSchema).default([]),
  references: z.array(ReferenceSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  meta: ResumeMetaSchema.optional(),
  // Intentionally no `.default([])` here: `preserveMetaData` relies on
  // `undefined` to distinguish "caller omitted metaData → keep the stored
  // value" from "caller sent metaData:[] → intentionally clear". A default
  // would silently wipe media attachments on every content update.
  metaData: z.array(ResumeSectionMetaSchema).optional(),
});
export type ResumeContent = z.infer<typeof ResumeContentSchema>;

// ---------------------------------------------------------------------------
// Envelope — mirrors `resume_information` DB columns 1:1 plus a few
// per-viewer computed fields. No legacy field names, no placeholders.
// ---------------------------------------------------------------------------

export const ResumeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  slug: z.string().nullable(),
  content: ResumeContentSchema,
  status: ResumeStatusSchema,
  privacy: ResumePrivacySchema,
  isMaster: z.boolean(),
  isActive: z.boolean(),
  parentId: z.string().nullable(),
  diffPercent: z.number().nullable(),
  templateId: z.string().nullable(),
  metaResumeId: z.string().nullable(),

  // Persisted analytics fields — real values, not placeholders.
  sentimentScore: z.number().nullable(),
  viewCount: z.number().int().nonnegative(),

  // Per-viewer computed (server-side, based on auth context).
  isOwner: z.boolean(),
  isWatched: z.boolean(),

  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Resume = z.infer<typeof ResumeSchema>;

/** Lighter shape for list pages — omits the full content blob. Used by
 *  list/summary endpoints that render a grid of cards. */
export const ResumeSummarySchema = ResumeSchema.omit({ content: true }).extend({
  // Surface the two fields the card UI reads from content without paying
  // the cost of shipping the whole document.
  summary: z.string(),
  headline: z.string(),
});
export type ResumeSummary = z.infer<typeof ResumeSummarySchema>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const CreateResumeSchema = z.object({
  title: z.string().min(1),
  content: ResumeContentSchema.partial().default({}),
  status: ResumeStatusSchema.default("draft"),
  privacy: ResumePrivacySchema.default("private"),
  isMaster: z.boolean().default(false),
  isActive: z.boolean().default(false),
  parentId: z.string().nullable().optional(),
  slug: SlugSchema.optional(),
  /** Raw resume text for AI parsing when `content` isn't pre-structured. */
  rawText: z.string().optional(),
});
export type CreateResumeRequest = z.infer<typeof CreateResumeSchema>;

export const UpdateResumeSchema = z.object({
  title: z.string().min(1).optional(),
  content: ResumeContentSchema.partial().optional(),
  status: ResumeStatusSchema.optional(),
  privacy: ResumePrivacySchema.optional(),
  isMaster: z.boolean().optional(),
  isActive: z.boolean().optional(),
  /** Null = detach from parent. Non-null parent changes go through the
   *  dedicated variation endpoints to preserve the one-level hierarchy. */
  parentId: z.null().optional(),
  slug: SlugSchema.nullable().optional(),
});
export type UpdateResumeRequest = z.infer<typeof UpdateResumeSchema>;

// ---------------------------------------------------------------------------
// Merge analysis — unchanged from before, re-exported here for convenience
// ---------------------------------------------------------------------------

export const MergeSectionTypeSchema = z.enum([
  "work",
  "education",
  "skills",
  "volunteer",
  "awards",
  "certificates",
  "publications",
  "languages",
  "interests",
  "references",
  "projects",
]);
export type MergeSectionType = z.infer<typeof MergeSectionTypeSchema>;
