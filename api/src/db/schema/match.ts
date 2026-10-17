import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { jobItems } from "./jobs.js";
import { resumeInformation } from "./resumes.js";

/**
 * Cached result of the most recent /api/match/analyze run for a given
 * (user, job, resume) triple. /api/match/tailor reads `recommendations`
 * from here so the extension no longer has to echo it back on tailor
 * requests. Overwritten on each re-score.
 *
 * Named `resume_match_scores` in parallel to `recruiter_match_scores`
 * (which scores talent-pool candidates). This table scores a user's
 * own resume against a job they've tracked.
 */
export const resumeMatchScores = pgTable("resume_match_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobItems.id, { onDelete: "cascade" }),
  resumeId: uuid("resume_id")
    .notNull()
    .references(() => resumeInformation.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  recommendations: text("recommendations").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("resume_match_scores_user_job_resume_idx").on(
    t.userId,
    t.jobId,
    t.resumeId,
  ),
  // The composite covers point lookups but not "all matches for user X"
  // / "all matches for job Y" rollups — those table-scanned without
  // these plain indexes.
  index("idx_resume_match_scores_job").on(t.jobId),
  index("idx_resume_match_scores_resume_id").on(t.resumeId),
]);

export type ResumeMatchScore = typeof resumeMatchScores.$inferSelect;
export type NewResumeMatchScore = typeof resumeMatchScores.$inferInsert;
