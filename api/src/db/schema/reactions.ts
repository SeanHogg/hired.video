/**
 * `reactions` — ONE polymorphic reaction table (W3-A, migration 0582)
 * replacing feed_post_likes, feed_comment_reactions and article_claps. Old
 * row ids were carried over.
 *
 * One row per (subject, user) — the old unique keys: switching a feed
 * reaction UPDATEs `reaction_type`; an article clap row keeps the running
 * total in `count` (capped app-side). Feed reactions always have count = 1.
 * Registries: shared/engagement-subjects.ts. No FK to the subject — the
 * `reactions_subject_deleted` triggers (0582) mirror the old cascades.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import {
  REACTION_SUBJECT_TYPES,
  REACTION_TYPES,
  sqlInList,
} from "../../../../shared/engagement-subjects.js";

const REACTION_SUBJECT_TYPES_SQL = sql.raw(sqlInList(REACTION_SUBJECT_TYPES));
const REACTION_TYPES_SQL = sql.raw(sqlInList(REACTION_TYPES));

export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reactionType: varchar("reaction_type", { length: 24 }).notNull().default("like"),
    count: integer("count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_reactions_subject_user").on(t.subjectType, t.subjectId, t.userId),
    index("idx_reactions_subject").on(t.subjectType, t.subjectId, t.createdAt.desc().nullsFirst()),
    index("idx_reactions_user_id").on(t.userId),
    check("reactions_subject_type_check", sql`${t.subjectType} IN (${REACTION_SUBJECT_TYPES_SQL})`),
    check("reactions_reaction_type_check", sql`${t.reactionType} IN (${REACTION_TYPES_SQL})`),
    check("reactions_count_check", sql`${t.count} >= 0`),
  ],
);

export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;
