/**
 * Context-aware help mappings (v2 — slug-keyed meta).
 *
 * Curates which help items surface on each *kind* of page, keyed on
 * `AIContextType` (the route→context seam reused from the AI brain). The
 * mapping points at a content **slug** — the content itself lives in
 * bundled Markdown files (`frontend/content/help/<slug>.<locale>.md`), NOT
 * the database. This table is pure meta: context → ordered slug list.
 *
 * One row per (context_key, slug); `position` orders the drawer,
 * `is_active` pulls an item from a context without deleting the row.
 * Migration 0210.
 */

import { pgTable, uuid, varchar, integer, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const helpMappings = pgTable(
  "help_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** AIContextType value, e.g. "resume-edit". Code enum, validated at the route. */
    contextKey: varchar("context_key", { length: 64 }).notNull(),
    /** Content slug — matches a `frontend/content/help/<slug>.*.md` item.
     *  No FK: content is files, not rows. */
    slug: varchar("slug", { length: 128 }).notNull(),
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_help_mappings_context_slug").on(t.contextKey, t.slug),
    index("idx_help_mappings_context_active").on(t.contextKey, t.isActive, t.position),
    index("idx_help_mappings_created_by").on(t.createdBy),
  ],
);

export type HelpMapping = typeof helpMappings.$inferSelect;
export type NewHelpMapping = typeof helpMappings.$inferInsert;
