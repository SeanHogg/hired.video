/**
 * content_audiences — polymorphic audience tags shared across every
 * content type. Mirrors the shape of content_locations.
 *
 * See migration 0149_audience_geo_demographics.sql for the design
 * rationale. A single row attaches one audience key to one
 * (entity_kind, entity_id) tuple. Two taxonomies share the table via the
 * `audience_taxonomy` discriminator:
 *   - 'life_stage'  — recent_graduates, students, unemployed, …
 *   - 'profession' — designer, developer, athlete, …
 *
 * Keep audience keys in sync with shared/audiences.ts (Zod-validated at
 * write time). CONTENT_AUDIENCE_KINDS is just an alias for
 * CONTENT_LOCATION_KINDS — every geo-taggable kind is audience-taggable.
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const contentAudiences = pgTable(
  "content_audiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    entityKind: varchar("entity_kind", { length: 32 }).notNull(),
    entityId: uuid("entity_id").notNull(),

    audienceKey: varchar("audience_key", { length: 64 }).notNull(),
    audienceTaxonomy: varchar("audience_taxonomy", { length: 16 })
      .default("life_stage")
      .notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("content_audiences_kind_audience_idx").on(
      t.entityKind,
      t.audienceKey,
    ),
    index("content_audiences_entity_idx").on(t.entityKind, t.entityId),
    uniqueIndex("content_audiences_entity_audience_uniq").on(
      t.entityKind,
      t.entityId,
      t.audienceKey,
    ),
  ],
);

export type ContentAudience = typeof contentAudiences.$inferSelect;
export type NewContentAudience = typeof contentAudiences.$inferInsert;
