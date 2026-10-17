import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const interviewSessions = pgTable("interview_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobDescription: text("job_description").notNull(),
  interviewType: varchar("interview_type", { length: 50 }).default("behavioral"),
  questions: jsonb("questions").notNull(),
  status: varchar("status", { length: 50 }).default("active"),
  overallScore: text("overall_score"),
  shareToken: text("share_token").unique(),
  isShared: boolean("is_shared").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_interview_sessions_user_id").on(t.userId),
]);

export type InterviewSession = typeof interviewSessions.$inferSelect;
export type NewInterviewSession = typeof interviewSessions.$inferInsert;

export const interviewAnswers = pgTable("interview_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => interviewSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  questionId: varchar("question_id", { length: 50 }).notNull(),
  question: text("question").notNull(),
  videoUrl: text("video_url"),
  r2Key: text("r2_key"),
  transcript: text("transcript"),
  score: text("score"),
  feedback: jsonb("feedback"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_interview_answers_session").on(t.sessionId),
  index("idx_interview_answers_user").on(t.userId),
]);

export type InterviewAnswer = typeof interviewAnswers.$inferSelect;
export type NewInterviewAnswer = typeof interviewAnswers.$inferInsert;
