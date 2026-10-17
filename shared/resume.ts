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
 * - `viewCount` is aggregated from the server-recorded `artifact_views` rows (kind resume).
 * - `sentimentScore` is persisted by the sentiment tool when it runs.
 *
 * ─── REFACTOR PROGRESS (living doc) ──────────────────────────────────────
 *
 * DONE (this PR):
 *   - Contract defined (this file).
 *   - DB: `sentiment_score` column on resume_information; `artifact_views`
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
 *   - Frontend components read PascalCase content keys in ~22 files:
 *     ResumeBuilder, DeclarativeResumeRenderer, resume-exporters,
 *     EmbeddedResume, MetadataModal, and the sample-resume / fakeData
 *     fixtures. All need camelCase migration.
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

/** Per-user vanity URL segment. Lowercase alnum + hyphens, 3–64 chars.
 *  Reject leading/trailing/double hyphens. UUID-shaped slugs are allowed
 *  because new resumes are seeded with `slug = id` so the row always has
 *  a stable URL segment; routes that accept a slug fall back to the id
 *  column when the path is UUID-shaped. */
// Produces a branded `Slug` on success so callers that accept a `Slug`
// parameter can't be handed an arbitrary string. See shared/value-types.ts
// for the branding rationale.
import type { Slug } from "./value-types.js";
import { ResumeScoresSchema } from "./scores.js";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  normalizeEmploymentType,
  type EmploymentType,
} from "./employment-types.js";
import {
  WORK_SETTINGS,
  WORK_SETTING_LABELS,
  normalizeWorkSetting,
  type WorkSetting,
} from "./work-settings.js";
export const SlugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(64, "Slug must be at most 64 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers, single hyphens only")
  .transform((s) => s as Slug);

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

/**
 * `interactive` is the per-record InteractiveCanvas (positioned set of
 * RenderableElements — text, image, video, audio, chips, chart,
 * webcam). Stored here as an opaque z.unknown() because the canonical
 * type lives in the frontend (`types/renderable-element.ts`) which
 * shared/ can't import. The frontend renderer self-gates via
 * `isInteractiveCanvas`. ATS / PDF exports skip this field — see
 * `frontend/lib/resume-exporters.ts`.
 */
const interactiveCanvasField = z.unknown().optional();

/**
 * How a role is performed — Remote / On-site / Hybrid — on a resume work
 * entry, or "" when the job-seeker hasn't said. Reuses the work-setting SSoT
 * (shared/work-settings.ts): any spelling folds to canonical kebab, and an
 * unknown value degrades to "" so healing a legacy/imported blob never throws.
 */
export const ResumeWorkSettingSchema = z.preprocess(
  (v) => (v == null || v === "" ? "" : (normalizeWorkSetting(String(v)) ?? "")),
  z.union([z.enum(WORK_SETTINGS), z.literal("")]),
);

/**
 * Engagement type — Full-time / Part-time / Contract … — on a resume work
 * entry, or "" when unspecified. Reuses the employment-type SSoT
 * (shared/employment-types.ts); "Contractor" folds to "contract" for free.
 */
export const ResumeEmploymentTypeSchema = z.preprocess(
  (v) => (v == null || v === "" ? "" : (normalizeEmploymentType(String(v)) ?? "")),
  z.union([z.enum(EMPLOYMENT_TYPES), z.literal("")]),
);

export const WorkSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  position: z.string().default(""),
  url: z.string().default(""),
  summary: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  // Where + how the role was performed. Optional (absent → "") so every
  // existing resume blob validates unchanged; canonical vocabularies are the
  // shared work-setting / employment-type SSoTs.
  locationType: ResumeWorkSettingSchema,
  employmentType: ResumeEmploymentTypeSchema,
  highlights: z.array(z.string()).default([]),
  interactive: interactiveCanvasField,
});
export type Work = z.infer<typeof WorkSchema>;

/** One display chip for a work entry's employment / location type. */
export interface WorkEntryTag {
  /** i18n flat key (e.g. "labels.workSetting.remote"); i18n-aware surfaces
   *  translate this. */
  key: string;
  /** English SSoT label — fallback + for plain surfaces (exports) that don't
   *  run i18n. */
  label: string;
}

/** kebab-case → camelCase, to map a canonical employment type ("full-time")
 *  onto its existing i18n label key segment ("fullTime"). */
function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * The employment + location chips for a work entry — the single source every
 * renderer (templates, profile, viewer, exports) reads so the same two facts
 * show the same way everywhere (DRY). Employment first, then location; an
 * unspecified field yields no chip.
 */
export function workEntryTags(
  w: Pick<Work, "employmentType" | "locationType">,
): WorkEntryTag[] {
  const tags: WorkEntryTag[] = [];
  if (w.employmentType) {
    tags.push({
      key: `labels.employmentType.${kebabToCamel(w.employmentType)}`,
      label: EMPLOYMENT_TYPE_LABELS[w.employmentType as EmploymentType],
    });
  }
  if (w.locationType) {
    tags.push({
      key: `labels.workSetting.${w.locationType}`,
      label: WORK_SETTING_LABELS[w.locationType as WorkSetting],
    });
  }
  return tags;
}

export const VolunteerSchema = z.object({
  id: z.string().optional(),
  organization: z.string().default(""),
  position: z.string().default(""),
  url: z.string().default(""),
  summary: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  highlights: z.array(z.string()).default([]),
  interactive: interactiveCanvasField,
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
  interactive: interactiveCanvasField,
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
  interactive: interactiveCanvasField,
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

/** Proficiency labels surfaced in the UI. Stored as a free-form string on
 *  Skill.level for backward compatibility with legacy documents that hold
 *  values like "Native" or "5/5", but every code path that *writes* a
 *  level should pick from this set so the SkillNetwork visualizer's
 *  level → colour mapping is total. */
export const SKILL_LEVELS = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Expert",
] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const SkillSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  level: z.string().default(""),
  keywords: z.array(z.string()).default([]),
  /** Inferred or asserted years of hands-on use. Optional because not
   *  every skill has dated evidence (e.g. soft skills). When evidence
   *  exists, `enrichSkillsWithEvidence` will derive this server-side
   *  so a re-render isn't dependent on the LLM having returned it. */
  yearsOfExperience: z.number().nonnegative().optional(),
});
export type Skill = z.infer<typeof SkillSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Skill evidence — the same pattern as `metaData` (media attachments). An
// evidence row binds a skill (by name and optional skill UUID) to a section
// item (work/volunteer/project/education/certificate/award/publication) via
// the item's `id`. Lives in `content.skillEvidence`, ships with JSON export,
// and is preserved across content writes by `preserveSkillEvidence`.
//
// Why mirror the media pattern instead of attaching skills directly to
// items? Three reasons: (1) one skill can be used in multiple positions —
// a flat skills[] keeps the canonical list intact and lets evidence be a
// many-to-many edge table; (2) the JSON Resume spec already prescribes
// flat skills[] and items without nested skills, so we stay round-trippable
// to standard tooling; (3) the existing media-attachment flow already
// solved the "binding by item UUID, surviving partial writes" problem,
// so skill evidence reuses that proven shape.
// ───────────────────────────────────────────────────────────────────────────

export const SkillEvidenceItemTypeSchema = z.enum([
  "work",
  "volunteer",
  "project",
  "education",
  "certificate",
  "award",
  "publication",
]);
export type SkillEvidenceItemType = z.infer<typeof SkillEvidenceItemTypeSchema>;

export const SkillEvidenceSchema = z.object({
  /** Stable evidence row id — clients rely on it for React keys and
   *  edit/delete operations. */
  id: z.string(),
  /** Optional pointer to the canonical Skill row. May be absent when the
   *  skill's id wasn't known at extraction time; `skillName` is the
   *  authoritative join key. */
  skillId: z.string().optional(),
  /** Canonical skill name — case-preserved, matched case-insensitively
   *  by the resolver. Required so an evidence row remains meaningful even
   *  if the user later removes the corresponding Skill entry. */
  skillName: z.string(),
  /** Section the evidence points at; pairs with `referenceId`. */
  itemType: SkillEvidenceItemTypeSchema,
  /** The section item's `id` (work[i].id, project[i].id, …). The visualizer
   *  resolves this back to the item to render position + organization. */
  referenceId: z.string(),
  /** Optional contribution scope when the skill wasn't used the entire
   *  duration of the item — e.g. only the last year of a 4-year role.
   *  When omitted, callers assume the full item duration. */
  monthsUsed: z.number().nonnegative().optional(),
  /** Where the evidence row came from. "extracted" = LLM, "manual" = user
   *  edit, "derived" = computed from keywords/highlights match. */
  source: z.enum(["extracted", "manual", "derived"]).default("extracted"),
  createdAt: z.string().optional(),
});
export type SkillEvidence = z.infer<typeof SkillEvidenceSchema>;

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
  /** The saved reference contact (/references) this item is live-linked to
   *  (#2258). `name` + `reference` are its snapshot: refreshed when the
   *  contact is edited (shared/resume-references.ts), kept as the fallback
   *  when the contact is deleted. Absent on a typed-in reference. */
  contactId: z.string().optional(),
});
export type Reference = z.infer<typeof ReferenceSchema>;

/**
 * #820 — optional Actor/Director film-credit sub-schema. Lets a casting
 * director run "actresses 25-35 with at least one lead theatre credit
 * who can dance" against the resume DB. When `film` is absent the
 * project keeps its existing freeform shape (the resume editor's
 * default for non-entertainment users).
 *
 * Field semantics:
 *   roleName     — character or role name (e.g. "Hamlet", "Lead Female")
 *   roleType     — 'lead' | 'supporting' | 'background' | 'ensemble' | 'cameo'
 *   production   — 'film' | 'tv' | 'theatre' | 'commercial' | 'voice' | 'short' | 'web'
 *   director     — credited director name (when known)
 *   network      — distributor / network / production company / theatre
 *   year         — release / run year (yyyy)
 *   episodes     — recurring TV credit episode count
 *   billed       — 'top' | 'co-star' | 'guest' | 'recurring' | 'star' (TV billing tier)
 *   stuntDouble  — booleans for niche search facets the gap text named
 *   physical     — height/skills tags (dance / stunt / accent) for filtering
 */
export const FilmCreditSchema = z.object({
  roleName: z.string().default(""),
  roleType: z
    .enum(["lead", "supporting", "background", "ensemble", "cameo"])
    .optional(),
  production: z
    .enum(["film", "tv", "theatre", "commercial", "voice", "short", "web"])
    .optional(),
  director: z.string().default(""),
  network: z.string().default(""),
  year: z.string().default(""),
  episodes: z.number().int().nonnegative().optional(),
  billed: z.enum(["top", "co-star", "guest", "recurring", "star"]).optional(),
  stuntDouble: z.boolean().optional(),
  physical: z
    .object({
      heightCm: z.number().int().positive().optional(),
      skills: z.array(z.string()).default([]),
      accents: z.array(z.string()).default([]),
    })
    .optional(),
});
export type FilmCredit = z.infer<typeof FilmCreditSchema>;

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
  interactive: interactiveCanvasField,
  /** #820 — Optional film credit shape for Actor/Director resumes.
   *  Casting search reads from `film.*`; non-entertainment resumes
   *  omit this and the project keeps its freeform behaviour. */
  film: FilmCreditSchema.optional(),
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
  // Skill ↔ section-item evidence rows. Same omit-vs-empty discipline as
  // metaData: omitted means "preserve", `[]` means "intentionally clear".
  // Persisted in `content` so JSON export round-trips evidence alongside
  // skills — that's what makes "prove qualified" answerable from the file.
  skillEvidence: z.array(SkillEvidenceSchema).optional(),
  // ─── App-level extras ────────────────────────────────────────────────────
  // Fields the hired.video app writes onto `content` beyond the JSON
  // Resume spec. Whitelisted explicitly here so the heal+validate pipe
  // preserves them — without these entries, Zod's default `.strip()`
  // would silently drop them on every write.
  /** Raw markdown alongside the structured document — set by resume
   *  upload flows and by `handleCreateVariation` when the caller passes
   *  `resumeData`. Kept so exports can round-trip the original. */
  markdown: z.string().optional(),
  /** Free-text blurb the user provides when creating a variant, e.g.
   *  "Tailored for startup roles". Rendered on the variant list. */
  variationDescription: z.string().optional(),
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
  scores: ResumeScoresSchema.nullable(),
  viewCount: z.number().int().nonnegative(),

  // Per-viewer computed (server-side, based on auth context).
  isOwner: z.boolean(),
  isWatched: z.boolean(),
  // Owner's Settings → Privacy → promoteWithoutAuth (#887). Only sent on
  // the anonymous detail read (GET /api/resumes/:id); lets the public page
  // skip the sign-in overlay for creators promoting their résumé.
  ownerPromoteWithoutAuth: z.boolean().optional(),

  // Soft-delete flag (#154). Null = active; ISO timestamp = archived at
  // that moment. List endpoints filter on null unless `includeArchived=1`.
  archivedAt: z.string().nullable(),

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
  // The résumé carries a cover letter (`content.meta.coverLetter`) — the
  // studio's "Your kits" row shows it without loading every document.
  hasCoverLetter: z.boolean().default(false),
});
export type ResumeSummary = z.infer<typeof ResumeSummarySchema>;

/** List-with-ownership envelope — `GET /api/resumes?owner=me&include=ownership`
 *  adds a marker so the Resumes page can separate "my resumes" from
 *  "resumes I track". Kept in shared/ so the frontend can't redefine the
 *  shape and drift from the backend emitter. */
export const ResumeWithOwnershipSchema = ResumeSummarySchema.extend({
  ownership: z.enum(["owned", "tracked"]),
});
export type ResumeWithOwnership = z.infer<typeof ResumeWithOwnershipSchema>;

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
// Use `z.input<>` not `z.infer<>` so frontend request builders can pass
// a plain string for `slug` — the transform-to-branded-Slug only runs at
// the backend validation boundary. `z.infer<>` would force every caller
// to pre-parse their slug into a `Slug` value, which is the parse-don't-
// validate contract inside the handler layer, not at request construction.
export type CreateResumeRequest = z.input<typeof CreateResumeSchema>;
/** The parsed (output) shape — what the backend handler sees after
 *  validation. Use this for handler-internal code. */
export type CreateResumeInput = z.infer<typeof CreateResumeSchema>;

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
// Same rationale as CreateResumeRequest above: request builders ship the
// plain-string shape; the handler sees the branded shape.
export type UpdateResumeRequest = z.input<typeof UpdateResumeSchema>;
export type UpdateResumeInput = z.infer<typeof UpdateResumeSchema>;

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
