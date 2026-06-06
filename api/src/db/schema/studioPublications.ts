import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { studioProjects } from "./resumes.js";

/**
 * studio_project_publications — single source of truth for "where has this
 * Studio project been published" (migration 0196).
 *
 * ONE row per (projectId, destination): the recorder UPSERTs on the unique
 * index so re-publishing to the same destination updates the existing row
 * (external id/url/published_at) rather than appending. `destination`
 * mirrors the shared `PublishDestinationId` union.
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
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    projDest: uniqueIndex("uq_studio_project_publications_proj_dest").on(
      t.projectId,
      t.destination,
    ),
    byProject: index("idx_studio_project_publications_project").on(t.projectId),
  }),
);

export type StudioProjectPublication =
  typeof studioProjectPublications.$inferSelect;
export type NewStudioProjectPublication =
  typeof studioProjectPublications.$inferInsert;
