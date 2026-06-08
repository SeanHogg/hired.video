/**
 * feed_features — SuperAdmin-curated dashboard feed cards, per role.
 *
 * See migration 0202_feed_features.sql for the design rationale and
 * shared/feed-features.ts for the discriminator + payload SSoT.
 *
 * Polymorphic by (entity_kind, entity_id), mirroring content_locations.
 * entity_id is a varchar (not uuid) because the curated set spans DB
 * entities AND static catalogue slugs (tools / pages). The render-ready
 * card lives in embed_payload so the dashboard read never N+1s.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const feedFeatures = pgTable(
  "feed_features",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    entityKind: varchar("entity_kind", { length: 32 }).notNull(),
    entityId: varchar("entity_id", { length: 128 }).notNull(),

    // Target roles. Empty array = global (every role). $type keeps the
    // string[] shape on reads without a cast at every call site.
    roles: jsonb("roles").$type<string[]>().default([]).notNull(),

    title: varchar("title", { length: 500 }).default("").notNull(),

    // RawApiItem snapshot the frontend card factory renders from.
    embedPayload: jsonb("embed_payload")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),

    rank: integer("rank").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),

    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("uq_feed_features_entity").on(t.entityKind, t.entityId),
    index("idx_feed_features_active_rank").on(t.isActive, t.rank),
  ],
);

export type FeedFeature = typeof feedFeatures.$inferSelect;
export type NewFeedFeature = typeof feedFeatures.$inferInsert;
