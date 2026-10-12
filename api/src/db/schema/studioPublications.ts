import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { studioProjects } from "./resumes.js";
import { studioProjectRenderVariants } from "./renderVariants.js";
import { users } from "./users.js";

/**
 * studio_project_publications — single source of truth for "where has this
 * Studio project been published" (migration 0196).
 *
 * ONE row per (projectId, destination, renderVariantId): the recorder
 * UPSERTs on uq_studio_project_publications_proj_dest_variant (NULLS NOT
 * DISTINCT so a null variant still collides). Re-publishing the same cut
 * to the same destination updates the existing row. `destination` mirrors
 * the shared `PublishDestinationId` union.
 *
 * NULLS NOT DISTINCT is owned by SQL (migrations 0529 + 0532), NOT declared
 * here: drizzle-kit 0.31 introspects every unique as nullsNotDistinct=false,
 * so declaring it makes push re-create the constraint on every deploy — and
 * on a non-empty table that is a "truncate?" prompt CI cannot answer.
 */
export const studioProjectPublications = pgTable(
  "studio_project_publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => studioProjects.id, { onDelete: "cascade" }),
    destination: varchar("destination", { length: 48 }).notNull(),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    status: varchar("status", { length: 24 }).default("published").notNull(),
    /** The fitted cut this destination was posted (migration 0522, #2045);
     *  null = the master render. */
    renderVariantId: uuid("render_variant_id").references(() => studioProjectRenderVariants.id, {
      onDelete: "set null",
    }),
    /** Whose connected account made the post (migration 0526, #2048) — the
     *  metrics sync reads it with that account. Null = unknown (on-platform
     *  destinations, rows from before 0526). */
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    projDest: unique("uq_studio_project_publications_proj_dest_variant")
      .on(t.projectId, t.destination, t.renderVariantId),
    byProject: index("idx_studio_project_publications_project").on(t.projectId),
    byVariant: index("idx_studio_project_publications_variant").on(t.renderVariantId),
    /** Webhooks name a post by the network's id (migration 0526, #2048). */
    byDestExternal: index("idx_studio_project_publications_dest_external").on(t.destination, t.externalId),
    byPublisher: index("idx_studio_project_publications_published_by").on(t.publishedBy),
  }),
);

export type StudioProjectPublication =
  typeof studioProjectPublications.$inferSelect;
export type NewStudioProjectPublication =
  typeof studioProjectPublications.$inferInsert;
