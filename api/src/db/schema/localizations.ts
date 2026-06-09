
import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { articles } from "./articles";
import { courses } from "./courses";
import { users } from "./users"; // Assuming users table is needed for ownership/auditing

// Table for localized article content
export const articleLocalizations = pgTable(
  "article_localizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 10 }).notNull(), // e.g., "fr", "es"
    title: varchar("title", { length: 255 }).notNull(),
    bodyMd: text("body_md"),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_article_localizations_article").on(t.articleId, t.language),
    unique("uq_article_localizations_article_language").on(t.articleId, t.language),
  ],
);

// Table for localized course content
export const courseLocalizations = pgTable(
  "course_localizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 10 }).notNull(), // e.g., "fr", "es"
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_course_localizations_course").on(t.courseId, t.language),
    unique("uq_course_localizations_course_language").on(t.courseId, t.language),
  ],
);

// Relations (optional, but good practice)
export const articleLocalizationRelations = relations(articleLocalizations, ({ one }) => ({
  article: one(articles, {
    fields: [articleLocalizations.articleId],
    references: [articles.id],
  }),
}));

export const courseLocalizationRelations = relations(courseLocalizations, ({ one }) => ({
  course: one(courses, {
    fields: [courseLocalizations.courseId],
    references: [courses.id],
  }),
}));

export type ArticleLocalization = typeof articleLocalizations.$inferSelect;
export type NewArticleLocalization = typeof articleLocalizations.$inferInsert;

export type CourseLocalization = typeof courseLocalizations.$inferSelect;
export type NewCourseLocalization = typeof courseLocalizations.$inferInsert;
