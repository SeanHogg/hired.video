// Generic, polymorphic Lists — ad-hoc bookmarks across People, Jobs,
// Resumes, and Companies. A list is owned by a user and can be:
//   • Personal (companyId = null)        — visible only to the owner
//   • Team-shared (companyId set, isPrivate = false) — visible to all
//                                          members of that company
//   • Owner-only inside a company (companyId set, isPrivate = true)
//
// Distinct from `recruiterTalentPools` which is a CRM concept (relationship
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
    kind: varchar("kind", { length: 16 }).default("custom").notNull(),
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
  ],
);

export type List =typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;

// list_items.entity_id is intentionally NOT a foreign key — it's polymorphic
// across users, jobs, resumes, companyProfiles. Routes validate the
// entity exists before inserting; on entity delete we rely on a periodic
// sweep (or simply tolerate dangling rows — they're harmless).
export const LIST_ITEM_ENTITY_TYPES = [
  "person",
  "job",
  "resume",
  "company",
  // A candidate-in-a-job-pipeline (jobPipelineEntries.id). Lets recruiters
  // bookmark a sourced candidate from the kanban without losing the
  // job-context the entry carries (notes, tags, stage history).
  "pipeline_entry",
  // A published course (courses.id). Backs the course-marketplace
  // wishlist heart — saved courses live in the caller's canonical
  // `kind = 'wishlist'` list.
  "course",
  // A published voice clone (studio_voice_clones.id) — the voice
  // marketplace wishlist heart.
  "voice_clone",
] as const;
export type ListItemEntityType = (typeof LIST_ITEM_ENTITY_TYPES)[number];

export const listItems = pgTable(
  "list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 16 }).notNull(), // 'person'|'job'|'resume'|'company'
    entityId: uuid("entity_id").notNull(),
    addedByUserId: uuid("added_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notes: text("notes"),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Prevent duplicate adds within a list
    uniqueIndex("list_items_unique_idx").on(t.listId, t.entityType, t.entityId),
    // "What lists is this entity in?" lookup
    index("list_items_entity_idx").on(t.entityType, t.entityId),
    // Pagination over a list
    index("list_items_list_idx").on(t.listId),
  ],
);

export type ListItem = typeof listItems.$inferSelect;
export type NewListItem = typeof listItems.$inferInsert;
