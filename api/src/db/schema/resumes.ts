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
  check,
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
}, (t) => [
  index("idx_meta_resumes_user_id").on(t.userId),
]);

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
  /** Versions only: when this version last took its master's content in
   *  (saved from the master, or "Pull into this version"). A version is
   *  stale when the master's `updatedAt` is later. Written only by
   *  services/resume/lineage.ts. Migration 0498. */
  masterSyncedAt: timestamp("master_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("resume_information_user_id_idx").on(table.userId),
  index("resume_information_parent_id_idx").on(table.parentId),
  // Partial index for the slug-keyed `/api/resumes/:id` lookup path —
  // see migration 0141 + gap #1588 (slug-keyed reads were sequentially
  // scanning the table and contributing to the Worker CPU exhaustion
  // that took down save-draft on 2026-05-26). `WHERE slug IS NOT NULL`
  // keeps the index small (most rows have a NULL slug) and MUST match
  // migration 0141 exactly so `db:push` doesn't try to recreate it.
  index("resume_information_slug_idx")
    .on(table.slug)
    .where(sql`${table.slug} IS NOT NULL`),
  index("idx_resume_information_user_updated").on(table.userId, table.updatedAt.desc().nullsFirst()).where(sql`archived_at IS NULL`),
  index("idx_resume_information_meta_resume_id").on(table.metaResumeId),
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
  // ── Reviewer-proposed draft (resume feedback / coaching) ──
  // Non-null `proposedByUserId` marks this version as a reviewer-submitted
  // draft (not an owner snapshot). `reviewId` links it to its review and
  // `proposalStatus` tracks the owner's decision. All null for normal
  // owner-authored snapshots. (#1946 — see shared/resume-feedback.ts.)
  proposedByUserId: uuid("proposed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  reviewId: uuid("review_id"),
  proposalStatus: varchar("proposal_status", { length: 16 }), // proposed | accepted | rejected
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_resume_versions_resume_created").on(t.resumeId, t.createdAt.desc().nullsFirst()),
  index("idx_resume_versions_review").on(t.reviewId).where(sql`review_id IS NOT NULL`),
  // #2305 — legacy UNIQUE (migration 0121_taxonomies_archive_versions.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uq_resume_versions_resume_version").on(t.resumeId, t.versionNumber),
  check("resume_versions_proposal_status_check", sql`${t.proposalStatus} IS NULL OR ${t.proposalStatus} IN ('proposed', 'accepted', 'rejected')`),
  index("idx_resume_versions_proposed_by_user_id").on(t.proposedByUserId),
  index("idx_resume_versions_user_id").on(t.userId),
]);

export type ResumeVersion = typeof resumeVersions.$inferSelect;
export type NewResumeVersion = typeof resumeVersions.$inferInsert;

export const watchedResumes = pgTable("watched_resumes", {
  id: uuid("id").primaryKey().defaultRandom(),
  viewerId: uuid("viewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  resumeId: uuid("resume_id").notNull().references(() => resumeInformation.id, { onDelete: "cascade" }),
  watchedAt: timestamp("watched_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // A viewer can only watch a given resume once. Enforced at the index
  // level so duplicate POST /watch/:id calls are idempotent.
  uniqueIndex("watched_resumes_viewer_resume_unique").on(table.viewerId, table.resumeId),
  index("idx_watched_resumes_resume_id").on(table.resumeId),
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
  index("idx_resume_views_viewer_id").on(table.viewerId),
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
  // Canvas-runtime axis (shared/media-kinds.ts MEDIA_KINDS). Length 24 (was
  // 16) so the longest value, "interactive_comic" (17 chars), actually fits —
  // a latent bug fixed in migration 0197 alongside adding "document".
  mediaKind: varchar("media_kind", { length: 24 }).default("video").notNull(),
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
  // Branching CHOICE GRAPH for mediaKind='interactive_comic' (Comic+)
  // projects (#1960 / #2126). Distinct from `comicState` (linear comic) and
  // from the per-page CanvasState (authored on the Timeline shell): this is
  // the `InteractiveComicState` shape (pages + startPageId + per-page choice
  // branches) in `shared/interactive-comic-state.ts`. Same parallel-column
  // pattern as the other non-Timeline runtimes. Null for non-Comic+ projects.
  // Migration 0486.
  interactiveComicState: jsonb("interactive_comic_state"),
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
  // 3D CAD state JSON for mediaKind='cad_3d' projects. Same parallel-column
  // pattern as cadState. Shape in `shared/cad-3d-state.ts` (primitives +
  // boolean ops + materials + build-volume). Null for non-cad_3d projects.
  // Migration 0184 / #930 Phase 2.
  cad3dState: jsonb("cad_3d_state"),
  // Document state JSON for mediaKind='document' projects — the paged
  // WYSIWYG canvas backing resume / job / article / blog (#1912). Same
  // parallel-column pattern as the other non-Timeline runtimes. Shape lives
  // in `frontend/lib/studio/editor-v2/document-state.ts` (DocumentState —
  // pages + flow blocks + Widget overlays + theme + page geometry). Null
  // for every non-document project. Migration 0197.
  documentState: jsonb("document_state"),
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
  // "THE video pitch recruiters see" pointer (#1237 / #2133). Only set on
  // `purpose: "pitch"` projects (storyboard._purpose); per-user singleton
  // via the partial unique index below, flipped by services/pitch/
  // pitchService.setCurrentPitch (clear sibling + set in one tx).
  // Migration 0519 adds it and backfills the legacy users.video_pitch_url.
  isCurrentPitch: boolean("is_current_pitch").default(false).notNull(),
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
  uniqueIndex("uq_studio_projects_current_pitch_per_user")
    .on(table.userId)
    .where(sql`${table.isCurrentPitch} = true`),
  uniqueIndex("uq_studio_projects_slug")
    .on(table.slug)
    .where(sql`${table.slug} IS NOT NULL`),
  // The legacy twin studio_projects_slug_unique_idx (0084, same key and
  // predicate) is deliberately NOT declared: push drops it, and
  // uq_studio_projects_slug above keeps slugs unique.
  index("idx_studio_projects_is_featured").on(table.updatedAt.desc().nullsFirst()).where(sql`(is_featured = true)`),
  index("idx_studio_projects_media_kind").on(table.mediaKind).where(sql`((media_kind)::text <> 'video'::text)`),
  check("studio_projects_kind_check", sql`${table.kind} IN ('scene', 'nle')`),
  check("studio_projects_media_kind_check", sql`${table.mediaKind} IN ('video', 'podcast', 'voice', 'animation', 'game', 'comic', 'interactive_comic', 'image', 'cad', 'cad_3d', 'document')`),
  index("idx_studio_projects_resume_id").on(table.resumeId),
  index("idx_studio_projects_user_id").on(table.userId),
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
  index("idx_studio_project_subjects_subject").on(table.subjectKind, table.subjectId),
  uniqueIndex("uq_studio_project_subjects_triple").on(table.projectId, table.subjectKind, table.subjectId),
]);

export type StudioProjectSubject = typeof studioProjectSubjects.$inferSelect;
export type NewStudioProjectSubject = typeof studioProjectSubjects.$inferInsert;
