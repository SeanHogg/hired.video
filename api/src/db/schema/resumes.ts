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
  /** The video plan's theme + goal (`content.meta.video.themeId` /
   *  `.targeting.goal`), denormalized for the public video feed (migration
   *  0615). Maintained from `content` on every content write by
   *  repositories/resumeVideoMetaColumns.ts; only valid ids are stored. */
  videoThemeId: varchar("video_theme_id", { length: 32 }),
  videoGoal: varchar("video_goal", { length: 16 }),
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

// Résumé snapshot history (#155) + reviewer-proposed drafts (#1946) live in
// `entity_versions` (subject_type 'resume', W3-E migration 0640) — see entityVersions.ts.

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

// Résumé view events live in the polymorphic artifact_views table
// (artifact_kind='resume'; resume_views folded in by W3-A 0580).

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
  // Save-draft meta (`_prompt`, `_jobDescription`, `_metaDescription`,
  // `_keywords`, `_socialCardImage`, `_slug` mirror) for EVERY kind, plus the
  // V1 VideoScript keys for kind='scene' rows. Not a runtime-state column —
  // it coexists with `state` on every row, so it stays its own column.
  storyboard: jsonb("storyboard"),
  // THE canvas-runtime state (migration 0610, W3-D1). Replaces the ten
  // mutually exclusive per-kind columns below; its shape is decided by
  // `media_kind` via shared/studio-project-state.ts (Timeline JSON for the
  // CanvasState-authoring kinds, GameState / ImageState / AnimationState /
  // CadState / Cad3DState / DocumentState for the self-hosting runtimes).
  // Read/write only through services/studio/project-state.ts.
  state: jsonb("state"),
  // Branching CHOICE GRAPH for mediaKind='interactive_comic' (Comic+)
  // projects (#1960 / #2126). Kept as its own column because it is a GENUINE
  // pair: a Comic+ project carries BOTH the per-page CanvasState (Timeline
  // JSON in `state`) AND this `InteractiveComicState` graph
  // (shared/interactive-comic-state.ts), written in the same save. Null for
  // non-Comic+ projects. Migration 0486.
  interactiveComicState: jsonb("interactive_comic_state"),
  // Content revision for the autosave's optimistic-concurrency check
  // (#2242). Promoted from `storyboard._rev` in migration 0610; bumped by
  // every content write (save-draft, NLE timeline PUT).
  revision: integer("revision").default(0).notNull(),
  // Project display name (was `storyboard._name`, migration 0610).
  name: varchar("name", { length: 200 }),
  // Studio purpose (shared/studio-purposes.ts; was `storyboard._purpose`,
  // migration 0610). Pitches are `purpose = 'pitch'`.
  purpose: varchar("purpose", { length: 32 }),
  // The hosted render's content stamp — mirrors `state._meta.bakedHash`
  // (which the frontend freshness check still reads) so publish/promotion
  // compare it without a JSONB extraction. Maintained on every `state`
  // write by repositories/studioProjectsRepository.ts. Migration 0610.
  bakedHash: text("baked_hash"),
  // ── Legacy per-kind state columns — FROZEN since migration 0610 ────────
  // Backfilled into `state` and snapshotted to
  // archive.studio_projects_legacy_state (0611). No code reads or writes
  // them; they stay declared only so `drizzle-kit push --force` (which runs
  // BEFORE the SQL migrations) cannot drop them ahead of the 0610 backfill.
  // Remove them from this schema one deploy after 0610/0611 are applied.
  legacyTimelineSpec: jsonb("timeline_spec"),
  legacyGameState: jsonb("game_state"),
  legacyComicState: jsonb("comic_state"),
  legacyImageState: jsonb("image_state"),
  legacyAnimationState: jsonb("animation_state"),
  legacyCadState: jsonb("cad_state"),
  legacyCad3dState: jsonb("cad_3d_state"),
  legacyDocumentState: jsonb("document_state"),
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
  // unpublish handler in PATCH /api/studio/projects/:id ({ status }) (Publish
  // sets this row true + clears any sibling primary in one tx;
  // Unpublish sets it false). All "show the profile video" read paths
  // — /api/channels/:handle, /api/studio/videos/user/:userId,
  // ResumeProfileLayout — filter on this column so the surface picks
  // the unambiguous primary regardless of how many other "exported" or
  // historical "published" rows exist. See migration 0088.
  isProfilePrimary: boolean("is_profile_primary").default(false).notNull(),
  // "THE video pitch recruiters see" pointer (#1237 / #2133). Only set on
  // `purpose = 'pitch'` projects (the `purpose` column); per-user singleton
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
  index("idx_studio_projects_purpose").on(table.purpose),
  check("studio_projects_purpose_check", sql`${table.purpose} IN ('basic', 'resume', 'job_ad', 'company_promo', 'recruiter_brand', 'product_launch', 'personal_brand', 'course_lesson', 'pitch')`),
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
