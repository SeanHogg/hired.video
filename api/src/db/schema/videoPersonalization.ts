import { sql } from "drizzle-orm";
import { pgTable, uuid, text, smallint, boolean, varchar, timestamp, check } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * user_video_personalization — Settings › Video personalization (migration
 * 0503, gap #2350). Shape: shared/video-personalization.ts. One row per user;
 * no row = the defaults. Single writer: services/video-personalization.
 */
export const userVideoPersonalization = pgTable("user_video_personalization", {
  userId:             uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  ownWords:           text("own_words").notNull().default(""),
  interests:          text("interests").array().notNull().default([]),
  birthdayMonth:      smallint("birthday_month"),
  birthdayDay:        smallint("birthday_day"),
  weddingMonth:       smallint("wedding_month"),
  weddingDay:         smallint("wedding_day"),
  memoryMonth:        smallint("memory_month"),
  memoryDay:          smallint("memory_day"),
  isParent:           boolean("is_parent").notNull().default(false),
  useWorkAnniversary: boolean("use_work_anniversary").notNull().default(true),
  useGraduation:      boolean("use_graduation").notNull().default(true),
  themeMode:          varchar("theme_mode", { length: 8 }).notNull().default("byDate"),
  fixedThemeId:       varchar("fixed_theme_id", { length: 32 }),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("user_video_personalization_own_words_check", sql`char_length(${t.ownWords}) <= 200`),
  check("user_video_personalization_interests_check", sql`coalesce(array_length(${t.interests}, 1), 0) <= 3`),
  check("user_video_personalization_birthday_month_check", sql`${t.birthdayMonth} BETWEEN 1 AND 12`),
  check("user_video_personalization_birthday_day_check", sql`${t.birthdayDay} BETWEEN 1 AND 31`),
  check("user_video_personalization_wedding_month_check", sql`${t.weddingMonth} BETWEEN 1 AND 12`),
  check("user_video_personalization_wedding_day_check", sql`${t.weddingDay} BETWEEN 1 AND 31`),
  check("user_video_personalization_memory_month_check", sql`${t.memoryMonth} BETWEEN 1 AND 12`),
  check("user_video_personalization_memory_day_check", sql`${t.memoryDay} BETWEEN 1 AND 31`),
  check("user_video_personalization_theme_mode_check", sql`${t.themeMode} IN ('byDate','fixed')`),
  check("user_video_personalization_check", sql`${t.themeMode} = 'byDate' OR ${t.fixedThemeId} IS NOT NULL`),
]);
