/**
 * Courses / SCORM / Certifications (#160 foundation).
 *
 * See README "Training Materials & SCORM — Build Strategy" for the wider
 * argument: ~80% of authoring is Studio reuse; this schema captures only
 * the course→module→lesson hierarchy + enrolment + certificate.
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
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const COURSE_STATUSES = ["draft", "in_review", "published", "unlisted", "flagged"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

/** #200 — Per-provider LMS adapter id. Each connector adapter implements
 *  the same publishCourse + checkPublishStatus + revokeCourse contract. */
export const LMS_PROVIDERS = [
  "cornerstone",
  "workday_learning",
  "docebo",
  "talentlms",
  "successfactors",
] as const;
export type LmsProvider = (typeof LMS_PROVIDERS)[number];

export const COURSE_DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type CourseDifficulty = (typeof COURSE_DIFFICULTIES)[number];

export const COURSE_LESSON_SOURCE_TYPES = [
  "studio_video",
  "scorm_package",
  "external_url",
  "text_md",
] as const;
export type CourseLessonSourceType = (typeof COURSE_LESSON_SOURCE_TYPES)[number];

export const SCORM_VERSIONS = ["1.2", "2004_1", "2004_2", "2004_3", "2004_4"] as const;
export type ScormVersion = (typeof SCORM_VERSIONS)[number];

// ---------------------------------------------------------------------------
// courses
// ---------------------------------------------------------------------------
export const courses = pgTable(
  "courses",
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
    estimatedMinutes: integer("estimated_minutes"),

    status: varchar("status", { length: 32 }).default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),

    priceCents: integer("price_cents").default(0).notNull(),
    priceVisible: boolean("price_visible").default(true).notNull(),
    platformFeeBps: integer("platform_fee_bps").default(500).notNull(),

    issuesCertificate: boolean("issues_certificate").default(false).notNull(),
    passingScorePct: integer("passing_score_pct"),

    // Authoring path tag — true when an employer published the course
    // outside the creator program. Matches migration 0126; lets the
    // marketplace scope listings (internal training stays off the public
    // creator marketplace by default).
    isEmployerAuthored: boolean("is_employer_authored").default(false).notNull(),

    enrollmentCount: integer("enrollment_count").default(0).notNull(),
    completionCount: integer("completion_count").default(0).notNull(),
    averageRating: real("average_rating"),
    ratingCount: integer("rating_count").default(0).notNull(),

    /** #166 — Optional pointer to a studio_template row (template
     *  marketplace) that supplies the course's branding tokens. The
     *  same template kind used for video chrome powers course chrome —
     *  no parallel "course-only" template system. */
    themeId: uuid("theme_id"),
    /** Inline override map for theme tokens. When set, merges over the
     *  themeId base. Shape mirrors the existing brand-kit JSON used by
     *  studio (logo, colors, fonts). */
    themeTokens: jsonb("theme_tokens"),

    /** #1502 — Named reviewer for the in_review workflow. Set when the
     *  author submits the course for review; the reviewer's queue page
     *  filters on this column. ON DELETE SET NULL so reviewer churn
     *  doesn't lose the course's history. */
    assignedReviewerId: uuid("assigned_reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_courses_user").on(t.userId, t.createdAt),
    index("idx_courses_status_published").on(t.status, t.publishedAt),
    index("idx_courses_theme_id").on(t.themeId),
    index("idx_courses_assigned_reviewer").on(t.assignedReviewerId),
    uniqueIndex("uq_courses_user_slug").on(t.userId, t.slug),
  ],
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;

// ---------------------------------------------------------------------------
// course_modules — chapters within a course
// ---------------------------------------------------------------------------
export const courseModules = pgTable(
  "course_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_course_modules_course").on(t.courseId, t.sortOrder)],
);

export type CourseModule = typeof courseModules.$inferSelect;
export type NewCourseModule = typeof courseModules.$inferInsert;

// ---------------------------------------------------------------------------
// course_lessons — leaf content. Polymorphic `source_type` discriminator.
// ---------------------------------------------------------------------------
export const courseLessons = pgTable(
  "course_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id").references(() => courseModules.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary"),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    studioProjectId: text("studio_project_id"),
    /** #1520 — Optional companion Studio video for `source_type='text_md'`
     *  lessons. When present, the lesson renderer offers a Read/Watch tab
     *  toggle so learners can switch between the article-style body and a
     *  60-90s explainer video without leaving the lesson view. */
    companionStudioProjectId: uuid("companion_studio_project_id"),
    scormManifestUrl: text("scorm_manifest_url"),
    scormEntryUrl: text("scorm_entry_url"),
    scormVersion: varchar("scorm_version", { length: 16 }),
    // #1440 — pkgId returned by `extractAndUploadScormZip`. Lets the
    // lesson DELETE handler prefix-delete every R2 key under
    // `uploads/<ownerId>/scorm/<scormPkgId>/` instead of orphaning the
    // entire package. Only populated for scormPackage-sourced lessons.
    scormPkgId: uuid("scorm_pkg_id"),
    externalUrl: text("external_url"),
    bodyMd: text("body_md"),
    // Tiptap (ProseMirror) JSON kept in lockstep with body_md when the
    // creator authors text_md lessons through the WYSIWYG editor. See
    // #1569 / migration 0139.
    bodyJson: jsonb("body_json"),
    estimatedMinutes: integer("estimated_minutes"),
    isRequired: boolean("is_required").default(true).notNull(),
    knowledgeCheckFormId: uuid("knowledge_check_form_id"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_course_lessons_course").on(t.courseId, t.sortOrder),
    index("idx_course_lessons_module").on(t.moduleId, t.sortOrder),
  ],
);

export type CourseLesson = typeof courseLessons.$inferSelect;
export type NewCourseLesson = typeof courseLessons.$inferInsert;

// ---------------------------------------------------------------------------
// course_enrollments — one per (user, course)
// ---------------------------------------------------------------------------
export interface LessonProgress {
  status: "not_started" | "in_progress" | "passed" | "failed";
  scoreRaw?: number;
  scoreMax?: number;
  timeSpentSec?: number;
  lastSeenAt?: string;
}

export const courseEnrollments = pgTable(
  "course_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    progress: jsonb("progress").$type<Record<string, LessonProgress>>().default({}).notNull(),
    finalScorePct: integer("final_score_pct"),
    passed: boolean("passed").default(false).notNull(),
    paymentRef: text("payment_ref"),
    paidAmountCents: integer("paid_amount_cents"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    platformFeeCents: integer("platform_fee_cents"),
    creatorCutCents: integer("creator_cut_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_course_enrollments_user").on(t.userId, t.enrolledAt),
    index("idx_course_enrollments_course").on(t.courseId, t.enrolledAt),
    uniqueIndex("uq_course_enrollments_user_course").on(t.userId, t.courseId),
  ],
);

export type CourseEnrollment = typeof courseEnrollments.$inferSelect;
export type NewCourseEnrollment = typeof courseEnrollments.$inferInsert;

// ---------------------------------------------------------------------------
// course_certificates — verifiable cert on completion
// ---------------------------------------------------------------------------
export const courseCertificates = pgTable(
  "course_certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => courseEnrollments.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    certNumber: varchar("cert_number", { length: 64 }).notNull().unique(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    signedPayload: text("signed_payload").notNull(),
    courseTitle: varchar("course_title", { length: 255 }).notNull(),
    recipientName: varchar("recipient_name", { length: 255 }).notNull(),
    externalProvider: varchar("external_provider", { length: 64 }),
    externalId: text("external_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_course_certificates_user").on(t.userId, t.issuedAt),
    index("idx_course_certificates_course").on(t.courseId, t.issuedAt),
    // At most one active (non-revoked) cert per enrollment. Revoked
    // certs leave revoked_at populated so a re-grant can insert a new
    // active row without colliding.
    uniqueIndex("uq_course_certificates_active_enrollment")
      .on(t.enrollmentId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

export type CourseCertificate = typeof courseCertificates.$inferSelect;
export type NewCourseCertificate = typeof courseCertificates.$inferInsert;

// ---------------------------------------------------------------------------
// #200 — LMS Connectors. Per-tenant OAuth tokens for course export to an
// external LMS. Course-publish flow chooses a connector + queues a row
// into lms_course_publishes, which the cron drains by calling the
// provider adapter in api/src/services/lms/<provider>.ts.
// ---------------------------------------------------------------------------
export const lmsConnectors = pgTable(
  "lms_connectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id"),
    provider: varchar("provider", { length: 40 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    baseUrl: text("base_url"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).default("connected").notNull(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_lms_connectors_user").on(t.userId),
    index("idx_lms_connectors_provider").on(t.provider),
  ],
);

export type LmsConnector = typeof lmsConnectors.$inferSelect;
export type NewLmsConnector = typeof lmsConnectors.$inferInsert;

export const lmsCoursePublishes = pgTable(
  "lms_course_publishes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectorId: uuid("connector_id").notNull().references(() => lmsConnectors.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull(),
    externalId: text("external_id"),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    lastError: text("last_error"),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_lms_course_publishes_connector").on(t.connectorId),
    index("idx_lms_course_publishes_course").on(t.courseId),
  ],
);

export type LmsCoursePublish = typeof lmsCoursePublishes.$inferSelect;
export type NewLmsCoursePublish = typeof lmsCoursePublishes.$inferInsert;
