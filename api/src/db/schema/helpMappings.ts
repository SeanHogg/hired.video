/**
 * Context-aware help mappings.
 *
 * Curates which published help articles surface on each *kind* of page,
 * keyed on `AIContextType` (the route→context seam reused from the AI
 * brain — see `shared/help.ts`). One row per (context_key, article_id);
 * `position` orders the drawer, `is_active` lets an operator pull an
 * article from a context without deleting the row.
 *
 * Mirrors the page_embed_videos registry shape (route→resource binding,
 * SuperAdmin-curated, soft-active toggle). Migration 0210.
 */

import { pgTable, uuid, varchar, integer, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { articles } from "./articles.js";

export const helpMappings = pgTable(
  "help_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** AIContextType value, e.g. "resume-edit". Not an FK — it's a code
     *  enum (shared/ai-context-types.ts), validated at the route. */
    contextKey: varchar("context_key", { length: 64 }).notNull(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_help_mappings_context_article").on(t.contextKey, t.articleId),
    index("idx_help_mappings_context_active").on(t.contextKey, t.isActive, t.position),
  ],
);

export type HelpMapping = typeof helpMappings.$inferSelect;
export type NewHelpMapping = typeof helpMappings.$inferInsert;
