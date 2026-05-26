import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";

export const metaResumes = pgTable("meta_resumes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MetaResume = typeof metaResumes.$inferSelect;
export type NewMetaResume = typeof metaResumes.$inferInsert;

export const resumeInformation = pgTable("resume_information", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metaResumeId: uuid("meta_resume_id").references(() => metaResumes.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  content: jsonb("content").notNull().default({}),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  templateId: uuid("template_id"),
  // Resume hierarchy & display fields
  isMaster: boolean("is_master").default(false).notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  // Self-referential: null = root / variation of parentId. ON DELETE
  // SET NULL so deleting a parent resume promotes its variants to roots
  // instead of cascade-deleting the variant tree.
  parentId: uuid("parent_id").references((): AnyPgColumn => resumeInformation.id, { onDelete: "set null" }),
  slug: varchar("slug", { length: 255 }),  // per-user vanity URL segment
  privacyLevel: integer("privacy_level").default(10).notNull(),  // 0=public,1=recruiter,2=connections,10=private
  diffPercent: integer("diff_percent"),  // 0-100, percent difference vs parent; only populated on children
  // Latest sentiment score written by the sentiment analysis tool. Null
  // until the tool has been run against this resume.
  sentimentScore: integer("sentiment_score"),
  // Latest analytical scores written by the AI Resume Scorer + Resume
  // Optimizer. Validated by ResumeScoresSchema in shared/scores.ts.
  // Null until either tool has been run against this resume.
  scores: jsonb("scores"),
  /** When set, this resume is archived — hidden from the default list
   *  on /resumes behind an "Include archived" toggle (#154). Soft
   *  delete that preserves slug + analytics + score history. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("resume_information_user_id_idx").on(table.userId),
  index("resume_information_parent_id_idx").on(table.parentId),
  // Partial index for the slug-keyed `/api/resumes/:id` lookup path —
  // see migration 0141 + gap #1588 (slug-keyed reads were sequentially
  // scanning the table and contributing to the Worker CPU exhaustion
  // that took down save-draft on 2026-05-26).
  index("resume_information_slug_idx").on(table.slug),
]);

export type ResumeInformation = typeof resumeInformation.$inferSelect;
export type NewResumeInformation = typeof resumeInformation.$inferInsert;

/** Resume version snapshots — mirrors studio_project_versions (#131).
 *  Autosave rows churn fast (50-cap + 30-day retention enforced by the
 *  versions service); user-labeled snapshots are kept until the user
 *  deletes the parent resume. */
export const resumeVersions = pgTable("resume_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  resumeId: uuid("resume_id").notNull().references(() => resumeInformation.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  label: varchar("label", { length: 120 }),
  resumeData: jsonb("resume_data").notNull(),
  isAutosave: boolean("is_autosave").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ResumeVersion = typeof resumeVersions.$inferSelect;
export type NewResumeVersion = typeof resumeVersions.$inferInsert;

export const resumeTemplates = pgTable("resume_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  templateData: jsonb("template_data").notNull().default({}),
  isPublic: boolean("is_public").default(true).notNull(),
  isPro: boolean("is_premium").default(false).notNull(),
  // Sectors this template is recommended for. Empty array = generic.
  // See shared/sectors.ts Sector enum.
  sectors: jsonb("sectors").$type<string[]>().notNull().default([]),
  // Marks the template as a career-pivot template (e.g. the existing
  // `video-resume-pivot-led.json`). The pivot-explorer page filters on
  // this flag when recommending a template for tech → AI-resilient
  // sector transitions.
  isPivotTemplate: boolean("is_pivot_template").notNull().default(false),
  /** #158 — Marketplace fields. A creator-authored template defaults to
   *  `private` and never lists publicly unless the owner explicitly
   *  publishes it. The consent snapshot is required to flip
   *  `visibility = 'public'`. The legacy `isPublic` flag stays for
   *  platform-curated free templates; marketplace listings additionally
   *  set `visibility = 'public'`. */
  visibility: varchar("visibility", { length: 20 }).default("private").notNull(),
  listingSlug: text("listing_slug"),
  /** Snapshotted from PLATFORM_FEE_BPS_DEFAULT or the user's per-account
   *  override at opt-in time. 500 = 5% platform fee, 95% to creator. */
  platformFeeBps: integer("platform_fee_bps").default(500).notNull(),
  priceCents: integer("price_cents").default(0).notNull(),
  consentAgreedAt: timestamp("consent_agreed_at", { withTimezone: true }),
  consentIp: text("consent_ip"),
  consentUa: text("consent_ua"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ResumeTemplate = typeof resumeTemplates.$inferSelect;
export type NewResumeTemplate = typeof resumeTemplates.$inferInsert;

export const watchedResumes = pgTable("watched_resumes", {
  id: uuid("id").primaryKey().defaultRandom(),
  viewerId: uuid("viewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  resumeId: uuid("resume_id").notNull().references(() => resumeInformation.id, { onDelete: "cascade" }),
  watchedAt: timestamp("watched_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // A viewer can only watch a given resume once. Enforced at the index
  // level so duplicate POST /watch/:id calls are idempotent.
  uniqueIndex("watched_resumes_viewer_resume_unique").on(table.viewerId, table.resumeId),
]);

export type WatchedResume = typeof watchedResumes.$inferSelect;
export type NewWatchedResume = typeof watchedResumes.$inferInsert;

// Per-view event log for resumes. Each row is a single view by a
// (possibly anonymous) viewer. The aggregate view count shown on the UI
// is derived from this table — no denormalized counter on
// resume_information to avoid drift.
export const resumeViews = pgTable("resume_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  resumeId: uuid("resume_id").notNull().references(() => resumeInformation.id, { onDelete: "cascade" }),
  // null = anonymous viewer (unauthenticated public view).
  viewerId: uuid("viewer_id").references(() => users.id, { onDelete: "set null" }),
  // Hashed IP (sha256 + daily salt) for anonymous dedup. Never stores the
  // raw IP to stay in line with privacy expectations.
  ipHash: varchar("ip_hash", { length: 64 }),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("resume_views_resume_id_idx").on(table.resumeId),
  index("resume_views_viewed_at_idx").on(table.viewedAt),
]);

export type ResumeView = typeof resumeViews.$inferSelect;
export type NewResumeView = typeof resumeViews.$inferInsert;

// Studio Projects — kept here since they are tightly coupled to resume workflows
export const studioProjects = pgTable("studio_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Company-ownership: when set, the project is owned by the company and
  // userId becomes the editor/last-actor (preserved for attribution and
  // audit). Reads filter as `userId = me OR companyId IN (my companies)`.
  // Writes are gated by assertCompanyEditor() in services/studio/workspace.ts.
  // See migration 0058_studio_company_ownership.sql.
  companyId: uuid("company_id").references(() => companyProfiles.id, { onDelete: "cascade" }),
  // Optional "this is your work item" pointer inside a company workspace
  // so multi-recruiter teams can self-divide drafts without each member
  // seeing only their own. All members still see all projects; assignment
  // is a focus aid, not a permission.
  assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
  resumeText: text("resume_text").notNull(),
  resumeId: uuid("resume_id").references(() => resumeInformation.id, { onDelete: "set null" }),
  // Editor surface discriminator: 'scene' uses `storyboard`; 'nle' uses
  // `timelineSpec`. See migration 0067 + shared/timeline.ts. Default
  // 'scene' keeps every pre-0067 row pointed at the legacy editor.
  kind: varchar("kind", { length: 16 }).default("scene").notNull(),
  // Output axis (#894) — orthogonal to `kind` (which is a STORAGE
  // discriminator). Drives the export menu, publish destinations, and
  // per-template "Exports as MP4 / MP3+RSS / GIF" panel. See
  // `shared/media-kinds.ts` for the enum + per-kind output profiles.
  // Default 'video' so every pre-migration row keeps today's behaviour.
  // Migration 0099.
  mediaKind: varchar("media_kind", { length: 16 }).default("video").notNull(),
  storyboard: jsonb("storyboard"),
  // Frame-accurate Timeline JSON for kind='nle' projects. See
  // shared/timeline.ts for the shape and isRenderable() for the
  // precondition the render facade asserts.
  timelineSpec: jsonb("timeline_spec"),
  // Game state JSON for mediaKind='game' projects. Parallel to
  // `timelineSpec` — each canvas runtime owns its own state column
  // per the canvas-runtime extensibility model in PRD §1.2. Null for
  // non-game projects (Timeline runtime uses `timelineSpec`). See
  // `shared/game-state.ts` for the shape. Migration 0101 / #927.
  gameState: jsonb("game_state"),
  // Comic state JSON for mediaKind='comic' projects. Same parallel-
  // column pattern as `gameState`; the comic runtime shape lands in a
  // future `shared/comic-state.ts` alongside its canvas implementation
  // (#929). Migration 0101 / #929.
  comicState: jsonb("comic_state"),
  // Image state JSON for mediaKind='image' projects. Parallel column
  // for the Photoshop-shaped raster editor (#932); shape lives in
  // `shared/image-state.ts` (layers + dimensions + history). Null for
  // every non-image project. Migration 0102.
  imageState: jsonb("image_state"),
  // Animation state JSON for mediaKind='animation' projects. Same
  // parallel-column pattern as `gameState` / `imageState`. Shape lives
  // in `shared/animation-state.ts` (frames + fps + onion-skin depth +
  // background + loop count). Null for every non-animation project.
  // Migration 0106 / #1003.
  animationState: jsonb("animation_state"),
  // CAD state JSON for mediaKind='cad' projects. Same parallel-column
  // pattern. Shape lives in `shared/cad-state.ts` (vector shapes +
  // drawing extents + unit + grid). Null for non-cad projects.
  // Migration 0107 / #930.
  cadState: jsonb("cad_state"),
  // Public-URL slug. Promoted from `storyboard._slug` to a real column
  // in migration 0141 because the JSONB extraction made the per-save
  // uniqueness check sequentially scan studio_projects and blow the
  // Worker CPU budget (#661). The save-draft writer mirrors into both
  // this column and the JSONB for backward read compatibility.
  slug: varchar("slug", { length: 120 }),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  videoId: uuid("video_id"),
  // Project-level visibility. After the Save/Publish split (#665) the
  // unified <StudioPlayer/> plays the saved script JSON live, so a
  // project becomes viewable in-platform the moment this flips true —
  // no MP4 render required. `videos.privacy_status` still gates the
  // off-platform CDN URL. See migration 0083_studio_projects_is_public.
  isPublic: boolean("is_public").default(false).notNull(),
  // "THE video resume on my profile" pointer. Per-user singleton — the
  // partial unique index below enforces that at most one project per
  // user has is_profile_primary=true. Flipped atomically by the publish/
  // unpublish handler in PATCH /api/studio/projects/:id/status (Publish
  // sets this row true + clears any sibling primary in one tx;
  // Unpublish sets it false). All "show the profile video" read paths
  // — /api/channels/:handle, /api/studio/videos/user/:userId,
  // ResumeProfileLayout — filter on this column so the surface picks
  // the unambiguous primary regardless of how many other "exported" or
  // historical "published" rows exist. See migration 0088.
  isProfilePrimary: boolean("is_profile_primary").default(false).notNull(),
  // SA-curated homepage carousel flag. Project-level (not video-level)
  // because v2 (kind='nle') projects play live off `timelineSpec` via
  // <CanvasStatePreview/> and have no `videos` row until export — the
  // old `videos.is_featured` gate locked them out of the carousel even
  // when fully public. Toggled via PATCH /api/admin/studio/projects/:id
  // /featured. Read by GET /api/studio/videos/featured. Multi-feature:
  // any number of rows may be true. See migration 0091.
  isFeatured: boolean("is_featured").default(false).notNull(),
  retryCount: integer("retry_count").default(0).notNull(),
  // Subject links live in `studio_project_subjects` (many-to-many) per
  // migration 0061 — see studioProjectSubjects below. The legacy 1:1
  // `subject_kind`/`subject_id` columns from 0056 were dropped in 0061.
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_studio_projects_company").on(table.companyId),
  index("idx_studio_projects_assigned_user").on(table.assignedUserId),
  index("idx_studio_projects_kind").on(table.kind),
  uniqueIndex("uq_studio_projects_profile_primary_per_user")
    .on(table.userId)
    .where(sql`${table.isProfilePrimary} = true`),
  uniqueIndex("uq_studio_projects_slug")
    .on(table.slug)
    .where(sql`${table.slug} IS NOT NULL`),
]);

export type StudioProject = typeof studioProjects.$inferSelect;
export type NewStudioProject = typeof studioProjects.$inferInsert;

// ---------------------------------------------------------------------------
// Studio Project Subjects — many-to-many link between a video project and
// the entities it's "about" (resume / profile / job / company /
// skills_demo). One project can be linked to N entities; one entity can
// host N projects. Polymorphic via (kind, id).
// ---------------------------------------------------------------------------
export const studioProjectSubjects = pgTable("studio_project_subjects", {
  id:          uuid("id").primaryKey().defaultRandom(),
  projectId:   uuid("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
  subjectKind: text("subject_kind").notNull(),
  subjectId:   text("subject_id").notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_studio_project_subjects_project").on(table.projectId),
  index("idx_studio_project_subjects_subject").on(table.subjectKind, table.subjectId),
  uniqueIndex("uq_studio_project_subjects_triple").on(table.projectId, table.subjectKind, table.subjectId),
]);

export type StudioProjectSubject = typeof studioProjectSubjects.$inferSelect;
export type NewStudioProjectSubject = typeof studioProjectSubjects.$inferInsert;
