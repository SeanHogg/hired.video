/**
 * Localized help content (#2004-adjacent — help content i18n).
 *
 * The base article row (`articles`) holds the canonical EN copy. This
 * table holds per-locale overrides of an article's user-facing prose
 * (title / summary / body) so a Spanish or Canadian-French visitor reads
 * help in their language — with EN as the automatic fallback (a missing
 * row, or a null column, falls back to the base article).
 *
 * Mirrors the per-(kind, locale) row pattern already used by
 * `legal_documents`. One row per (article_id, locale). Migration 0212.
 */

import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { articles } from "./articles.js";

export const helpContentTranslations = pgTable(
  "help_content_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    /** Supported locale (shared/i18n.ts), e.g. "es", "fr-CA". EN is the
     *  base article, never stored here. */
    locale: varchar("locale", { length: 10 }).notNull(),
    title: varchar("title", { length: 255 }),
    summary: text("summary"),
    bodyMd: text("body_md"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_help_content_translations_article_locale").on(t.articleId, t.locale)],
);

export type HelpContentTranslation = typeof helpContentTranslations.$inferSelect;
export type NewHelpContentTranslation = typeof helpContentTranslations.$inferInsert;
