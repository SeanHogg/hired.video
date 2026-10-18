// Generic, polymorphic Lists — ad-hoc bookmarks across People, Jobs,
// Resumes, and Companies. A list is owned by a user and can be:
//   • Personal (companyId = null)        — visible only to the owner
//   • Team-shared (companyId set, isPrivate = false) — visible to all
//                                          members of that company
//   • Owner-only inside a company (companyId set, isPrivate = true)
//
// Distinct from the archived `recruiter_talent_pools` CRM concept (relationship
// strength, last-contacted, follow-ups). Lists are deliberately lightweight.

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  text,
  index,
  uniqueIndex,
  integer,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";

export const lists = pgTable(
  "lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Null = personal list. Set = scoped to a company; visibility depends on isPrivate.
    companyId: uuid("company_id").references(() => companyProfiles.id, {
      onDelete: "cascade",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    // 'custom' = a user-created list. 'wishlist' = the single canonical
    // per-user wishlist that backs the heart-toggle affordance on cards /
    // detail pages. Exactly one wishlist row per owner is enforced by a
    // partial unique index (see migration 0198) so the get-or-create helper
    // can rely on it. Wishlists are always personal (companyId = null).
    // 'recruiter_list' | 'call_queue' = recruiter CRM lists (gap #1360),
    // folded in from recruiter_lists by migration 0624 — see shared/lists.ts.
    kind: varchar("kind", { length: 16 }).default("custom").notNull(),
    description: text("description"),
    isPrivate: boolean("is_private").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("lists_owner_idx").on(t.ownerUserId),
    index("lists_company_idx").on(t.companyId),
    // #2305 — legacy UNIQUE (migration 0198_lists_wishlist_kind.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
    uniqueIndex("lists_owner_wishlist_unique_idx")
      .on(t.ownerUserId)
      .where(sql`kind = 'wishlist'`),
    check("lists_kind_check", sql`${t.kind} IN ('custom', 'wishlist', 'recruiter_list', 'call_queue')`),
  ],
);

export type List =typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;

// list_items.entity_id is intentionally NOT a foreign key — it's polymorphic
// across users, jobs, resumes, companyProfiles. Routes validate the
// entity exists before inserting; on entity delete we rely on a periodic
// sweep (or simply tolerate dangling rows — they're harmless).
// Registry lives in shared/lists.ts (CHECK list_items_entity_type_check).
export { LIST_ITEM_ENTITY_TYPES, type ListItemEntityType } from "../../../../shared/lists.js";

export const listItems = pgTable(
  "list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 32 }).notNull(), // LIST_ITEM_ENTITY_TYPES
    entityId: uuid("entity_id").notNull(),
    addedByUserId: uuid("added_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notes: text("notes"),
    /** Manual order (call queues dial top-down); 0 for unordered lists. */
    position: integer("position").default(0).notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Prevent duplicate adds within a list
    uniqueIndex("list_items_unique_idx").on(t.listId, t.entityType, t.entityId),
    // "What lists is this entity in?" lookup
    index("list_items_entity_idx").on(t.entityType, t.entityId),
    // Pagination over a list
    index("idx_list_items_added_by_user_id").on(t.addedByUserId),
    check("list_items_entity_type_check", sql`${t.entityType} IN ('person', 'job', 'resume', 'company', 'pipeline_entry', 'course', 'voice_clone', 'talent_pool_candidate')`),
  ],
);

export type ListItem = typeof listItems.$inferSelect;
export type NewListItem = typeof listItems.$inferInsert;
