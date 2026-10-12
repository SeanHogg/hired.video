import { pgTable, uuid, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { studioProjects } from "./resumes.js";
import { videos } from "./videos.js";

/**
 * studio_project_render_variants — fitted cuts of a Studio project's master
 * render (migration 0522, #2045). A network whose preset the master doesn't
 * fit (wrong frame, too long) is posted a cut reframed / trimmed for it; one
 * cut serves every network with the same needs (shared/publish-presets
 * `variantKeyFor`, e.g. "9x16-full", "16x9-140").
 *
 * ONE row per (project, variant key, content revision): `content_revision`
 * is the master content's timeline hash (+ branding), so an unchanged project
 * reuses its cut and an edit gets a fresh one. The rendered file is an
 * ordinary `videos` row (private, never the project's `video_id`).
 * Publications and promotion submissions reference the cut they posted by
 * `render_variant_id`.
 */
export const studioProjectRenderVariants = pgTable(
  "studio_project_render_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => studioProjects.id, { onDelete: "cascade" }),
    variantKey: varchar("variant_key", { length: 32 }).notNull(),
    contentRevision: varchar("content_revision", { length: 64 }).notNull(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_studio_project_render_variants_proj_key_rev").on(t.projectId, t.variantKey, t.contentRevision),
    // One file is one cut; also serves the "is this video a cut of that project" check.
    uniqueIndex("uq_studio_project_render_variants_video").on(t.videoId),
  ],
);

export type StudioProjectRenderVariant = typeof studioProjectRenderVariants.$inferSelect;
