/**
 * Learning pathways + SCORM runtime + xAPI LRS — bolts on to the
 * courses foundation in `./courses.ts`.
 *
 * Migration: drizzle/0126_courses_learning_paths_scorm_runtime.sql
 *
 *   • coursePrerequisites      — DAG edges; cycle detection enforced in
 *                                LearningPathService.assertNoCycle()
 *   • learningPaths            — curated course collections
 *   • learningPathCourses      — ordered display sequence (not unlock
 *                                order — that comes from the DAG)
 *   • learningPathEnrollments  — one per (user, path)
 *   • scormCmiStates           — SCORM 1.2 / 2004 CMI persistence per
 *                                (enrollment, lesson). Owns score + status
 *                                so course-completion rollups don't need
 *                                to parse the opaque cmi blob.
 *   • xapiStatements           — internal LRS; mirrored to external LRS
 *                                later for enterprise customers.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { courses, courseLessons, courseEnrollments } from "./courses.js";

// ---------------------------------------------------------------------------
// course_prerequisites — DAG of "course X requires course Y passed"
// ---------------------------------------------------------------------------
export const coursePrerequisites = pgTable(
  "course_prerequisites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    prerequisiteCourseId: uuid("prerequisite_course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_course_prerequisites_edge").on(t.courseId, t.prerequisiteCourseId),
    index("idx_course_prerequisites_prereq").on(t.prerequisiteCourseId),
  ],
);

export type CoursePrerequisite = typeof coursePrerequisites.$inferSelect;
export type NewCoursePrerequisite = typeof coursePrerequisites.$inferInsert;

// ---------------------------------------------------------------------------
// learning_paths
// ---------------------------------------------------------------------------
export const LEARNING_PATH_STATUSES = ["draft", "published", "unlisted"] as const;
export type LearningPathStatus = (typeof LEARNING_PATH_STATUSES)[number];

export const learningPaths = pgTable(
  "learning_paths",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary"),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    category: varchar("category", { length: 100 }),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    difficulty: varchar("difficulty", { length: 32 }),

    status: varchar("status", { length: 32 }).default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),

    issuesCertificate: boolean("issues_certificate").default(false).notNull(),
    isEmployerAuthored: boolean("is_employer_authored").default(false).notNull(),

    enrollmentCount: integer("enrollment_count").default(0).notNull(),
    completionCount: integer("completion_count").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_learning_paths_user").on(t.userId, t.createdAt),
    index("idx_learning_paths_status_published").on(t.status, t.publishedAt),
    uniqueIndex("uq_learning_paths_user_slug").on(t.userId, t.slug),
  ],
);

export type LearningPath = typeof learningPaths.$inferSelect;
export type NewLearningPath = typeof learningPaths.$inferInsert;

// ---------------------------------------------------------------------------
// learning_path_courses
// ---------------------------------------------------------------------------
export const learningPathCourses = pgTable(
  "learning_path_courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pathId: uuid("path_id").notNull().references(() => learningPaths.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").default(0).notNull(),
    isRequired: boolean("is_required").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_learning_path_courses_edge").on(t.pathId, t.courseId),
    index("idx_learning_path_courses_path").on(t.pathId, t.displayOrder),
    index("idx_learning_path_courses_course").on(t.courseId),
  ],
);

export type LearningPathCourse = typeof learningPathCourses.$inferSelect;
export type NewLearningPathCourse = typeof learningPathCourses.$inferInsert;

// ---------------------------------------------------------------------------
// learning_path_enrollments
// ---------------------------------------------------------------------------
export const learningPathEnrollments = pgTable(
  "learning_path_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pathId: uuid("path_id").notNull().references(() => learningPaths.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_learning_path_enrollments_user").on(t.userId, t.enrolledAt),
    index("idx_learning_path_enrollments_path").on(t.pathId, t.enrolledAt),
    uniqueIndex("uq_learning_path_enrollments_user_path").on(t.userId, t.pathId),
  ],
);

export type LearningPathEnrollment = typeof learningPathEnrollments.$inferSelect;
export type NewLearningPathEnrollment = typeof learningPathEnrollments.$inferInsert;

// ---------------------------------------------------------------------------
// scorm_cmi_states — SCORM 1.2 / 2004 CMI persistence per (enrollment, lesson)
// ---------------------------------------------------------------------------
export const SCORM_COMPLETION_STATUSES = [
  "not_attempted",
  "incomplete",
  "completed",
  "passed",
  "failed",
] as const;
export type ScormCompletionStatus = (typeof SCORM_COMPLETION_STATUSES)[number];

export const scormCmiStates = pgTable(
  "scorm_cmi_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => courseEnrollments.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    scormVersion: varchar("scorm_version", { length: 16 }).notNull(),
    cmi: jsonb("cmi").$type<Record<string, unknown>>().default({}).notNull(),
    completionStatus: varchar("completion_status", { length: 32 }),
    scoreRaw: real("score_raw"),
    scoreMin: real("score_min"),
    scoreMax: real("score_max"),
    totalTimeSec: integer("total_time_sec").default(0).notNull(),
    suspendData: text("suspend_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_scorm_cmi_enrollment_lesson").on(t.enrollmentId, t.lessonId),
    index("idx_scorm_cmi_lesson").on(t.lessonId, t.updatedAt),
  ],
);

export type ScormCmiState = typeof scormCmiStates.$inferSelect;
export type NewScormCmiState = typeof scormCmiStates.$inferInsert;

// ---------------------------------------------------------------------------
// xapi_statements — internal LRS (forwardable to enterprise LRS later)
// ---------------------------------------------------------------------------
export const xapiStatements = pgTable(
  "xapi_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id").references(() => courseEnrollments.id, { onDelete: "set null" }),
    lessonId: uuid("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    verbId: varchar("verb_id", { length: 255 }).notNull(),
    verbDisplay: varchar("verb_display", { length: 80 }),
    objectId: varchar("object_id", { length: 255 }).notNull(),
    objectType: varchar("object_type", { length: 40 }).default("Activity").notNull(),
    resultScore: real("result_score"),
    resultSuccess: boolean("result_success"),
    statement: jsonb("statement").$type<Record<string, unknown>>().notNull(),
    storedAt: timestamp("stored_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_xapi_user_stored").on(t.userId, t.storedAt),
    index("idx_xapi_enrollment").on(t.enrollmentId, t.storedAt),
    index("idx_xapi_verb").on(t.verbId, t.storedAt),
  ],
);

export type XapiStatement = typeof xapiStatements.$inferSelect;
export type NewXapiStatement = typeof xapiStatements.$inferInsert;

/** Standard xAPI verb URIs we emit. Keep additions here so analytics
 *  rollups have one place to learn about new verbs. */
export const XAPI_VERBS = {
  EXPERIENCED: { id: "http://adlnet.gov/expapi/verbs/experienced", display: "experienced" },
  LAUNCHED: { id: "http://adlnet.gov/expapi/verbs/launched", display: "launched" },
  PROGRESSED: { id: "http://adlnet.gov/expapi/verbs/progressed", display: "progressed" },
  COMPLETED: { id: "http://adlnet.gov/expapi/verbs/completed", display: "completed" },
  PASSED: { id: "http://adlnet.gov/expapi/verbs/passed", display: "passed" },
  FAILED: { id: "http://adlnet.gov/expapi/verbs/failed", display: "failed" },
  SCORED: { id: "http://adlnet.gov/expapi/verbs/scored", display: "scored" },
  TERMINATED: { id: "http://adlnet.gov/expapi/verbs/terminated", display: "terminated" },
} as const;

// ---------------------------------------------------------------------------
// external_lrs_targets — enterprise xAPI forwarding (#1400 / build-strategy
// "External LRS forwarding"). Every statement written to the internal LRS
// is mirrored into each `active=true` row for that user, fire-and-forget.
//
// Auth modes mirror what Learning-Locker / Yet / SCORM Cloud accept:
//   • basic — header carries `Authorization: Basic base64(user:pass)`.
//   • bearer — header carries `Authorization: Bearer <token>` (rotates
//              outside our control; we just hold the latest known good).
//   • none — for self-hosted local LRSs behind a firewall.
//
// `customHeaders` is a free-form JSONB bag so an enterprise customer can
// stamp tenant ids without us shipping a new column per integration.
// ---------------------------------------------------------------------------
export const EXTERNAL_LRS_AUTH_MODES = ["basic", "bearer", "none"] as const;
export type ExternalLrsAuthMode = (typeof EXTERNAL_LRS_AUTH_MODES)[number];

export const externalLrsTargets = pgTable(
  "external_lrs_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    authMode: varchar("auth_mode", { length: 16 }).default("none").notNull(),
    authToken: text("auth_token"),
    customHeaders: jsonb("custom_headers"),
    active: boolean("active").default(true).notNull(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_external_lrs_user_active").on(t.userId, t.active),
  ],
);

export type ExternalLrsTarget = typeof externalLrsTargets.$inferSelect;
export type NewExternalLrsTarget = typeof externalLrsTargets.$inferInsert;
