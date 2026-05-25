/**
 * Courses / SCORM / Certifications (#160 foundation).
 *
 * See README "Training Materials & SCORM — Build Strategy" for the wider
 * argument: ~80% of authoring is Studio reuse.
 *
 * Routes (this file ships the foundation only — SCORM player runtime #161,
 * xAPI emit, cert issuance #165, payment + payout, LMS connectors #200 are
 * follow-ups):
 *
 *   Owner — courses
 *     POST   /api/courses                      — create draft
 *     GET    /api/courses/me                   — list my courses
 *     GET    /api/courses/:id                  — get my course (any status)
 *     PATCH  /api/courses/:id                  — update fields
 *     POST   /api/courses/:id/publish          — flip to published
 *     POST   /api/courses/:id/unpublish        — back to draft
 *     DELETE /api/courses/:id                  — hard delete (cascades)
 *
 *   Owner — modules + lessons
 *     POST   /api/courses/:id/modules                   — add module
 *     PATCH  /api/courses/modules/:moduleId             — update / reorder
 *     DELETE /api/courses/modules/:moduleId
 *     POST   /api/courses/:id/lessons                   — add lesson
 *     PATCH  /api/courses/lessons/:lessonId             — update / reorder
 *     DELETE /api/courses/lessons/:lessonId
 *
 *   Public
 *     GET    /api/courses/public                — paginated published-course feed
 *     GET    /api/courses/public/:userIdOrSlug/:slug — public course detail. The first
 *                                                segment is a UUID OR a userProfiles.customUrlSlug.
 *
 *   Learner
 *     POST   /api/courses/:id/enroll            — enrol current user (free courses only for now)
 *     GET    /api/courses/me/enrollments        — my enrolments
 *     PATCH  /api/courses/enrollments/:enrollmentId/progress  — update lesson progress
 */
import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  COURSE_LESSON_SOURCE_TYPES,
  COURSE_DIFFICULTIES,
  SCORM_VERSIONS,
} from "../db/schema/courses.js";
import { SCORM_COMPLETION_STATUSES, XAPI_VERBS } from "../db/schema/learning.js";
import { slugify } from "../../../shared/slugify.js";
import { isUuid } from "../../../shared/value-types.js";
import { USER_ROLES, pickScoringRole } from "../../../shared/user-roles.js";
import { filterVisibleCreators, isCreatorVisible } from "../services/creators/visibility.js";
import { LearningPathService } from "../services/learning/learning-path-service.js";
import { CertificateService } from "../services/learning/certificate-service.js";
import { gamificationFromContext, withGamification } from "../domains/gamification/with-gamification.js";
import { getJwtSecret } from "../utils/jwt.js";

const {
  courses,
  courseModules,
  courseLessons,
  courseEnrollments,
  courseCertificates,
  creatorProfiles,
  users,
  userProfiles,
  coursePrerequisites,
  learningPathCourses,
  scormCmiStates,
  xapiStatements,
} = schema;

export const courseRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function userRoles(c: any): string[] {
  const r = c.var.user?.roles;
  return Array.isArray(r) ? (r as string[]) : [];
}

async function getCoursesEnrollment(db: ReturnType<typeof getDb>, userId: string) {
  const [row] = await db.select()
    .from(creatorProfiles)
    .where(and(
      eq(creatorProfiles.userId, userId),
      sql`${creatorProfiles.endedAt} IS NULL`,
      eq(creatorProfiles.coursesActive, true),
    ))
    .limit(1);
  return row ?? null;
}

/** Authoring eligibility for courses + paths. Creator-program enrollees
 *  OR users holding the `employer` role. Single seam used by every
 *  create / publish handler in courses.ts + learning-paths.ts (rule:
 *  feedback_extract_on_duplication). Employers get
 *  `isEmployerAuthored=true` on the row so the public marketplace can
 *  scope listings. */
async function resolveAuthorEligibility(
  db: ReturnType<typeof getDb>,
  c: any,
): Promise<{ ok: true; isEmployerAuthored: boolean } | { ok: false }> {
  const userId = uid(c);
  if (!userId) return { ok: false };
  if (userRoles(c).includes(USER_ROLES.EMPLOYER)) {
    return { ok: true, isEmployerAuthored: true };
  }
  const creator = await getCoursesEnrollment(db, userId);
  if (creator) return { ok: true, isEmployerAuthored: false };
  return { ok: false };
}

async function ownsCourse(db: ReturnType<typeof getDb>, userId: string, courseId: string) {
  const [row] = await db.select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.userId, userId)))
    .limit(1);
  return row != null;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const CreateCourseSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().max(1000).optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  difficulty: z.enum(COURSE_DIFFICULTIES).optional(),
  estimatedMinutes: z.number().int().min(0).max(100_000).optional(),
  priceCents: z.number().int().min(0).optional(),
  priceVisible: z.boolean().optional(),
  issuesCertificate: z.boolean().optional(),
  passingScorePct: z.number().int().min(0).max(100).optional(),
});

const UpdateCourseSchema = CreateCourseSchema.partial().extend({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),
});

const CreateModuleSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const UpdateModuleSchema = CreateModuleSchema.partial();

const CreateLessonSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().optional(),
  moduleId: z.string().uuid().optional(),
  sourceType: z.enum(COURSE_LESSON_SOURCE_TYPES),
  studioProjectId: z.string().optional(),
  scormManifestUrl: z.string().url().optional(),
  scormEntryUrl: z.string().url().optional(),
  scormVersion: z.enum(SCORM_VERSIONS).optional(),
  externalUrl: z.string().url().optional(),
  bodyMd: z.string().optional(),
  estimatedMinutes: z.number().int().min(0).max(100_000).optional(),
  isRequired: z.boolean().optional(),
  knowledgeCheckFormId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const UpdateLessonSchema = CreateLessonSchema.partial();

const ProgressUpdateSchema = z.object({
  lessonId: z.string().uuid(),
  status: z.enum(["not_started", "in_progress", "passed", "failed"]),
  scoreRaw: z.number().optional(),
  scoreMax: z.number().optional(),
  timeSpentSec: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Public — registered before /:id so Hono's router doesn't capture
// `/api/courses/public` as a parameterised id="public" call against the
// auth-required `/:id` handler.
// ---------------------------------------------------------------------------

courseRoutes.get("/public", async (c) => {
  const db = getDb();
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, 100);
  // Defensive: degrades to an empty list if the courses tables aren't yet
  // applied to this environment's DB (migrations 0041/0042).
  try {
    const rows = await db
      .select({
        course: courses,
        author: { id: users.id, name: users.name },
        authorProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
      })
      .from(courses)
      .innerJoin(users, eq(courses.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(courses.status, "published"), eq(users.emailVerified, true)))
      .orderBy(desc(courses.publishedAt))
      .limit(limit);

    // #314 paywall — hide free creators' courses from the public list.
    const visible = await filterVisibleCreators(rows.map((r) => r.author.id));
    const items = rows.filter((r) => visible.has(r.author.id)).map((r) => ({
      id: r.course.id,
      type: "course" as const,
      title: r.course.title,
      slug: r.course.slug,
      summary: r.course.summary,
      coverImageUrl: r.course.coverImageUrl,
      category: r.course.category,
      tags: r.course.tags,
      difficulty: r.course.difficulty,
      estimatedMinutes: r.course.estimatedMinutes,
      priceCents: r.course.priceVisible ? r.course.priceCents : null,
      issuesCertificate: r.course.issuesCertificate,
      enrollmentCount: r.course.enrollmentCount,
      averageRating: r.course.averageRating,
      ratingCount: r.course.ratingCount,
      publishedAt: r.course.publishedAt,
      author: {
        id: r.author.id,
        name: r.author.name,
        avatarUrl: r.authorProfile?.avatarUrl ?? null,
        slug: r.authorProfile?.customUrlSlug ?? r.author.id,
      },
    }));
    return c.json(success(items), 200);
  } catch (e) {
    return c.json(success([] as unknown[]), 200);
  }
});

// Per-user public listing — every published course authored by the given
// UUID. Used by the public profile (Courses tab). Hidden creators
// (paywall #314) and unverified accounts return an empty list rather
// than a 404 so the calling component can render a clean empty state.
courseRoutes.get("/public/by-user/:userId", async (c) => {
  const db = getDb();
  const userId = c.req.param("userId");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 100);
  if (!(await isCreatorVisible(userId))) {
    return c.json(success([] as unknown[]), 200);
  }
  try {
    const rows = await db
      .select({
        course: courses,
        author: { id: users.id, name: users.name },
        authorProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
      })
      .from(courses)
      .innerJoin(users, eq(courses.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(
        eq(courses.userId, userId),
        eq(courses.status, "published"),
        eq(users.emailVerified, true),
      ))
      .orderBy(desc(courses.publishedAt))
      .limit(limit);
    const items = rows.map((r) => ({
      id: r.course.id,
      type: "course" as const,
      title: r.course.title,
      slug: r.course.slug,
      summary: r.course.summary,
      coverImageUrl: r.course.coverImageUrl,
      category: r.course.category,
      tags: r.course.tags,
      difficulty: r.course.difficulty,
      estimatedMinutes: r.course.estimatedMinutes,
      priceCents: r.course.priceVisible ? r.course.priceCents : null,
      issuesCertificate: r.course.issuesCertificate,
      enrollmentCount: r.course.enrollmentCount,
      averageRating: r.course.averageRating,
      ratingCount: r.course.ratingCount,
      publishedAt: r.course.publishedAt,
      author: {
        id: r.author.id,
        name: r.author.name,
        avatarUrl: r.authorProfile?.avatarUrl ?? null,
        slug: r.authorProfile?.customUrlSlug ?? r.author.id,
      },
    }));
    return c.json(success(items), 200);
  } catch {
    return c.json(success([] as unknown[]), 200);
  }
});

courseRoutes.get("/public/:userIdOrSlug/:slug", async (c) => {
  const db = getDb();
  // The first URL segment is the author identifier — accept either a UUID
  // (legacy) OR a userProfiles.customUrlSlug (what the marketplace card +
  // share-URL helpers produce, see CourseMarketplaceCard / buildShareAction).
  // Same resolution pattern as /api/users/:id and /api/users/:id/resumes.
  const userIdOrSlug = c.req.param("userIdOrSlug");
  let authorUserId = userIdOrSlug;
  if (!isUuid(userIdOrSlug)) {
    const [p] = await db
      .select({ userId: userProfiles.userId })
      .from(userProfiles)
      .where(eq(userProfiles.customUrlSlug, userIdOrSlug))
      .limit(1);
    if (!p) return c.json(error("NOT_FOUND", "Course not found"), 404);
    authorUserId = p.userId;
  }
  const [row] = await db
    .select({
      course: courses,
      author: { id: users.id, name: users.name },
      authorProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
    })
    .from(courses)
    .innerJoin(users, eq(courses.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(
      eq(courses.userId, authorUserId),
      eq(courses.slug, c.req.param("slug")),
      eq(courses.status, "published"),
      eq(users.emailVerified, true),
    ))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Course not found"), 404);
  // #314 paywall — free creators' courses 404 on the public route.
  if (!(await isCreatorVisible(row.author.id))) {
    return c.json(error("NOT_FOUND", "Course not found"), 404);
  }

  const modules = await db.select().from(courseModules)
    .where(eq(courseModules.courseId, row.course.id))
    .orderBy(courseModules.sortOrder);
  const lessons = await db.select({
    id: courseLessons.id,
    moduleId: courseLessons.moduleId,
    title: courseLessons.title,
    summary: courseLessons.summary,
    sourceType: courseLessons.sourceType,
    estimatedMinutes: courseLessons.estimatedMinutes,
    isRequired: courseLessons.isRequired,
    sortOrder: courseLessons.sortOrder,
  }).from(courseLessons)
    .where(eq(courseLessons.courseId, row.course.id))
    .orderBy(courseLessons.sortOrder);

  return c.json(success({
    course: {
      id: row.course.id,
      title: row.course.title,
      slug: row.course.slug,
      summary: row.course.summary,
      description: row.course.description,
      coverImageUrl: row.course.coverImageUrl,
      category: row.course.category,
      tags: row.course.tags,
      difficulty: row.course.difficulty,
      estimatedMinutes: row.course.estimatedMinutes,
      priceCents: row.course.priceVisible ? row.course.priceCents : null,
      issuesCertificate: row.course.issuesCertificate,
      passingScorePct: row.course.passingScorePct,
      enrollmentCount: row.course.enrollmentCount,
      completionCount: row.course.completionCount,
      averageRating: row.course.averageRating,
      ratingCount: row.course.ratingCount,
      publishedAt: row.course.publishedAt,
      author: {
        id: row.author.id,
        name: row.author.name,
        avatarUrl: row.authorProfile?.avatarUrl ?? null,
        slug: row.authorProfile?.customUrlSlug ?? row.author.id,
      },
    },
    modules,
    lessons,
  }), 200);
});

// ---------------------------------------------------------------------------
// Owner — courses
// ---------------------------------------------------------------------------

courseRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreateCourseSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();

  const eligibility = await resolveAuthorEligibility(db, c);
  if (!eligibility.ok) {
    return c.json(
      error(
        "AUTHORING_NOT_ELIGIBLE",
        "Authoring courses requires the Courses Creator Program (creators) or the employer role. Visit /services to enroll.",
      ),
      403,
    );
  }

  // Unique slug per author.
  const baseSlug = slugify(parsed.data.title, { fallback: () => `course-${Date.now()}` });
  let slug = baseSlug;
  let n = 1;
  while (true) {
    const [exists] = await db.select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.userId, userId), eq(courses.slug, slug)))
      .limit(1);
    if (!exists) break;
    n += 1;
    slug = `${baseSlug}-${n}`;
    if (n > 50) { slug = `${baseSlug}-${Date.now()}`; break; }
  }

  const [created] = await db.insert(courses).values({
    userId,
    slug,
    title: parsed.data.title,
    summary: parsed.data.summary ?? null,
    description: parsed.data.description ?? null,
    coverImageUrl: parsed.data.coverImageUrl ?? null,
    category: parsed.data.category ?? null,
    tags: parsed.data.tags ?? [],
    difficulty: parsed.data.difficulty ?? null,
    estimatedMinutes: parsed.data.estimatedMinutes ?? null,
    priceCents: parsed.data.priceCents ?? 0,
    priceVisible: parsed.data.priceVisible ?? true,
    issuesCertificate: parsed.data.issuesCertificate ?? false,
    passingScorePct: parsed.data.passingScorePct ?? null,
    isEmployerAuthored: eligibility.isEmployerAuthored,
    status: "draft",
  } as any).returning();
  return c.json(success(created), 201);
});

courseRoutes.get("/me", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db.select().from(courses)
    .where(eq(courses.userId, userId))
    .orderBy(desc(courses.updatedAt));
  return c.json(success(rows), 200);
});

courseRoutes.get("/me/enrollments", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select({ enrollment: courseEnrollments, course: courses })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courseEnrollments.courseId, courses.id))
    .where(eq(courseEnrollments.userId, userId))
    .orderBy(desc(courseEnrollments.enrolledAt));
  return c.json(success(rows), 200);
});

courseRoutes.get("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [row] = await db.select().from(courses)
    .where(and(eq(courses.id, c.req.param("id")), eq(courses.userId, userId)))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Course not found"), 404);
  const modules = await db.select().from(courseModules)
    .where(eq(courseModules.courseId, row.id))
    .orderBy(courseModules.sortOrder);
  const lessons = await db.select().from(courseLessons)
    .where(eq(courseLessons.courseId, row.id))
    .orderBy(courseLessons.sortOrder);
  return c.json(success({ course: row, modules, lessons }), 200);
});

courseRoutes.patch("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = UpdateCourseSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  if (!(await ownsCourse(db, userId, c.req.param("id")))) {
    return c.json(error("NOT_FOUND", "Course not found"), 404);
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of [
    "title", "summary", "description", "coverImageUrl", "category", "tags",
    "difficulty", "estimatedMinutes", "priceCents", "priceVisible",
    "issuesCertificate", "passingScorePct", "slug",
  ] as const) {
    if (k in parsed.data) (patch as any)[k] = (parsed.data as any)[k];
  }
  const [updated] = await db.update(courses).set(patch as any)
    .where(eq(courses.id, c.req.param("id")))
    .returning();
  return c.json(success(updated), 200);
});

courseRoutes.post("/:id/publish", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const eligibility = await resolveAuthorEligibility(db, c);
  if (!eligibility.ok) {
    return c.json(error("AUTHORING_NOT_ELIGIBLE", "Re-enable the Courses Creator Program at /services to publish (or hold the employer role)."), 403);
  }

  const [existing] = await db.select().from(courses)
    .where(and(eq(courses.id, c.req.param("id")), eq(courses.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Course not found"), 404);

  const lessonCount = await db.select({ n: sql<number>`count(*)::int` }).from(courseLessons)
    .where(eq(courseLessons.courseId, existing.id));
  if ((lessonCount[0]?.n ?? 0) === 0) {
    return c.json(error("VALIDATION_ERROR", "Add at least one lesson before publishing."), 400);
  }

  // Republish is a no-op for gamification; only flip-to-published from
  // never-published earns the COURSE_PUBLISHED action. The dedup-uniq
  // on refId=courseId in the points ledger collapses re-publish attempts.
  const wasUnpublished = existing.publishedAt == null;

  const [updated] = await db.update(courses).set({
    status: "published",
    publishedAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(courses.id, existing.id)).returning();

  if (wasUnpublished) {
    await withGamification(c, "course-published", (game, role, uid2) =>
      game.onCoursePublished({
        userId: uid2,
        role,
        courseId: existing.id,
        metadata: { title: existing.title, isEmployerAuthored: existing.isEmployerAuthored },
      }),
    );
  }

  return c.json(success(updated), 200);
});

courseRoutes.post("/:id/unpublish", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [updated] = await db.update(courses)
    .set({ status: "draft", publishedAt: null, updatedAt: new Date() } as any)
    .where(and(eq(courses.id, c.req.param("id")), eq(courses.userId, userId)))
    .returning();
  if (!updated) return c.json(error("NOT_FOUND", "Course not found"), 404);
  return c.json(success(updated), 200);
});

courseRoutes.delete("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [deleted] = await db.delete(courses)
    .where(and(eq(courses.id, c.req.param("id")), eq(courses.userId, userId)))
    .returning({ id: courses.id });
  if (!deleted) return c.json(error("NOT_FOUND", "Course not found"), 404);
  return c.json(success({ deleted: deleted.id }), 200);
});

/** POST /api/courses/:id/clone — deep-clone an owned course including its
 *  modules + lessons. Title gets " (Copy)" appended; slug is regenerated;
 *  status resets to draft so the clone never accidentally goes public.
 *  Mirrors the resume + job + studio-project clone pattern. */
courseRoutes.post("/:id/clone", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [original] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, c.req.param("id")), eq(courses.userId, userId)))
    .limit(1);
  if (!original) return c.json(error("NOT_FOUND", "Course not found"), 404);

  // Slug is `unique(userId, slug)` so we only have to dodge collisions
  // within the caller's own course catalog.
  const baseSlug = slugify(`${original.title}-copy`, {
    fallback: () => `course-${crypto.randomUUID().slice(0, 8)}`,
    maxLen: 50,
  });
  let candidateSlug = baseSlug;
  for (let i = 2; i <= 50; i++) {
    const [conflict] = await db.select({ id: courses.id }).from(courses)
      .where(and(eq(courses.userId, userId), eq(courses.slug, candidateSlug))).limit(1);
    if (!conflict) break;
    candidateSlug = `${baseSlug}-${i}`;
  }

  const {
    id: _omitId, createdAt: _omitCreated, updatedAt: _omitUpdated,
    publishedAt: _omitPublished, enrollmentCount: _omitEnroll,
    completionCount: _omitComplete, averageRating: _omitRating,
    ratingCount: _omitRatingCount,
    ...rest
  } = original as Record<string, unknown>;
  const [clone] = await db.insert(courses).values({
    ...rest,
    userId,
    title: `${original.title} (Copy)`,
    slug: candidateSlug,
    status: "draft",
  } as any).returning();

  // Deep-clone modules + lessons so the cloned course is editable end-to-end.
  // Module ids change, so we keep a sourceId → cloneId map to remap lesson FKs.
  const originalModules = await db.select().from(courseModules)
    .where(eq(courseModules.courseId, original.id))
    .orderBy(courseModules.sortOrder);
  const moduleIdMap = new Map<string, string>();
  for (const m of originalModules) {
    const { id: _mid, createdAt: _mcreated, updatedAt: _mupdated, courseId: _mcid, ...mRest } = m as Record<string, unknown>;
    const [clonedModule] = await db.insert(courseModules).values({
      ...mRest, courseId: clone!.id,
    } as any).returning({ id: courseModules.id });
    moduleIdMap.set(m.id, clonedModule!.id);
  }
  const originalLessons = await db.select().from(courseLessons)
    .where(eq(courseLessons.courseId, original.id))
    .orderBy(courseLessons.sortOrder);
  for (const l of originalLessons) {
    const { id: _lid, createdAt: _lcreated, updatedAt: _lupdated, courseId: _lcid, moduleId, ...lRest } = l as Record<string, unknown>;
    const remappedModuleId = moduleIdMap.get(moduleId as string) ?? null;
    await db.insert(courseLessons).values({
      ...lRest, courseId: clone!.id, moduleId: remappedModuleId,
    } as any);
  }

  return c.json(success({ id: clone!.id, slug: candidateSlug }), 201);
});

// ---------------------------------------------------------------------------
// Owner — modules
// ---------------------------------------------------------------------------

courseRoutes.post("/:id/modules", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreateModuleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  if (!(await ownsCourse(db, userId, c.req.param("id")))) {
    return c.json(error("NOT_FOUND", "Course not found"), 404);
  }
  const [created] = await db.insert(courseModules).values({
    courseId: c.req.param("id"),
    title: parsed.data.title,
    summary: parsed.data.summary ?? null,
    sortOrder: parsed.data.sortOrder ?? 0,
  } as any).returning();
  return c.json(success(created), 201);
});

courseRoutes.patch("/modules/:moduleId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = UpdateModuleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  // Authorise via the parent course
  const [existing] = await db
    .select({ courseId: courseModules.courseId, ownerId: courses.userId })
    .from(courseModules)
    .innerJoin(courses, eq(courses.id, courseModules.courseId))
    .where(eq(courseModules.id, c.req.param("moduleId")))
    .limit(1);
  if (!existing || existing.ownerId !== userId) {
    return c.json(error("NOT_FOUND", "Module not found"), 404);
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["title", "summary", "sortOrder"] as const) {
    if (k in parsed.data) (patch as any)[k] = (parsed.data as any)[k];
  }
  const [updated] = await db.update(courseModules).set(patch as any)
    .where(eq(courseModules.id, c.req.param("moduleId")))
    .returning();
  return c.json(success(updated), 200);
});

courseRoutes.delete("/modules/:moduleId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [existing] = await db
    .select({ ownerId: courses.userId })
    .from(courseModules)
    .innerJoin(courses, eq(courses.id, courseModules.courseId))
    .where(eq(courseModules.id, c.req.param("moduleId")))
    .limit(1);
  if (!existing || existing.ownerId !== userId) {
    return c.json(error("NOT_FOUND", "Module not found"), 404);
  }
  await db.delete(courseModules).where(eq(courseModules.id, c.req.param("moduleId")));
  return c.json(success({ deleted: c.req.param("moduleId") }), 200);
});

// ---------------------------------------------------------------------------
// Owner — lessons
// ---------------------------------------------------------------------------

courseRoutes.post("/:id/lessons", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreateLessonSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  if (!(await ownsCourse(db, userId, c.req.param("id")))) {
    return c.json(error("NOT_FOUND", "Course not found"), 404);
  }
  const [created] = await db.insert(courseLessons).values({
    courseId: c.req.param("id"),
    moduleId: parsed.data.moduleId ?? null,
    title: parsed.data.title,
    summary: parsed.data.summary ?? null,
    sourceType: parsed.data.sourceType,
    studioProjectId: parsed.data.studioProjectId ?? null,
    scormManifestUrl: parsed.data.scormManifestUrl ?? null,
    scormEntryUrl: parsed.data.scormEntryUrl ?? null,
    scormVersion: parsed.data.scormVersion ?? null,
    externalUrl: parsed.data.externalUrl ?? null,
    bodyMd: parsed.data.bodyMd ?? null,
    estimatedMinutes: parsed.data.estimatedMinutes ?? null,
    isRequired: parsed.data.isRequired ?? true,
    knowledgeCheckFormId: parsed.data.knowledgeCheckFormId ?? null,
    sortOrder: parsed.data.sortOrder ?? 0,
  } as any).returning();
  return c.json(success(created), 201);
});

courseRoutes.patch("/lessons/:lessonId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = UpdateLessonSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const [existing] = await db
    .select({ ownerId: courses.userId })
    .from(courseLessons)
    .innerJoin(courses, eq(courses.id, courseLessons.courseId))
    .where(eq(courseLessons.id, c.req.param("lessonId")))
    .limit(1);
  if (!existing || existing.ownerId !== userId) {
    return c.json(error("NOT_FOUND", "Lesson not found"), 404);
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of [
    "title", "summary", "moduleId", "sourceType", "studioProjectId",
    "scormManifestUrl", "scormEntryUrl", "scormVersion", "externalUrl",
    "bodyMd", "estimatedMinutes", "isRequired", "knowledgeCheckFormId", "sortOrder",
  ] as const) {
    if (k in parsed.data) (patch as any)[k] = (parsed.data as any)[k];
  }
  const [updated] = await db.update(courseLessons).set(patch as any)
    .where(eq(courseLessons.id, c.req.param("lessonId")))
    .returning();
  return c.json(success(updated), 200);
});

courseRoutes.delete("/lessons/:lessonId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [existing] = await db
    .select({ ownerId: courses.userId })
    .from(courseLessons)
    .innerJoin(courses, eq(courses.id, courseLessons.courseId))
    .where(eq(courseLessons.id, c.req.param("lessonId")))
    .limit(1);
  if (!existing || existing.ownerId !== userId) {
    return c.json(error("NOT_FOUND", "Lesson not found"), 404);
  }
  await db.delete(courseLessons).where(eq(courseLessons.id, c.req.param("lessonId")));
  return c.json(success({ deleted: c.req.param("lessonId") }), 200);
});

// ---------------------------------------------------------------------------
// Learner — enrolment + progress
// ---------------------------------------------------------------------------

courseRoutes.post("/:id/enroll", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [course] = await db.select().from(courses)
    .where(and(eq(courses.id, c.req.param("id")), eq(courses.status, "published")))
    .limit(1);
  if (!course) return c.json(error("NOT_FOUND", "Course not found"), 404);

  // Prerequisite gate (#161 sub-of-#160). Every direct prereq must already
  // be passed by this user; the closure-walk happens in the service.
  const pathService = new LearningPathService(db);
  const unlockState = await pathService.computeUnlockState(userId, [course.id]);
  if (!unlockState.unlocked.has(course.id)) {
    const missing = unlockState.locked.get(course.id) ?? [];
    return c.json(
      error("PREREQUISITES_NOT_MET", `Pass the prerequisite course(s) first: ${missing.join(", ")}`),
      409,
    );
  }

  // Free courses only for now — paid enrolment goes through the existing cart
  // checkout flow, which posts the payment_ref + paid_at on success. Returns
  // 402 to signal frontend to route to checkout instead.
  if (course.priceCents > 0) {
    return c.json(
      error(
        "PAYMENT_REQUIRED",
        `This course costs ${(course.priceCents / 100).toFixed(2)} ${course.priceVisible ? "USD" : ""}. Use the cart checkout flow to enroll.`,
      ),
      402,
    );
  }

  // Idempotent — if already enrolled, return the existing row.
  const [existing] = await db.select().from(courseEnrollments)
    .where(and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, course.id)))
    .limit(1);
  if (existing) return c.json(success(existing), 200);

  const [created] = await db.insert(courseEnrollments).values({
    courseId: course.id,
    userId,
  } as any).returning();

  // Bump aggregate (best-effort)
  await db.update(courses)
    .set({ enrollmentCount: sql`${courses.enrollmentCount} + 1` } as any)
    .where(eq(courses.id, course.id))
    .catch(() => undefined);

  return c.json(success(created), 201);
});

courseRoutes.patch("/enrollments/:enrollmentId/progress", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ProgressUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const [existing] = await db.select().from(courseEnrollments)
    .where(and(
      eq(courseEnrollments.id, c.req.param("enrollmentId")),
      eq(courseEnrollments.userId, userId),
    ))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Enrollment not found"), 404);

  const lessonId = parsed.data.lessonId;
  const wasPassed = existing.passed;
  const now = new Date().toISOString();
  const prevLessonStatus = (existing.progress?.[lessonId] as { status?: string } | undefined)?.status;
  const nextProgress = {
    ...(existing.progress ?? {}),
    [lessonId]: {
      status: parsed.data.status,
      scoreRaw: parsed.data.scoreRaw,
      scoreMax: parsed.data.scoreMax,
      timeSpentSec: parsed.data.timeSpentSec,
      lastSeenAt: now,
    },
  };

  // Course completion check: every required lesson now passed.
  const allLessons = await db.select({
      id: courseLessons.id,
      isRequired: courseLessons.isRequired,
    })
    .from(courseLessons)
    .where(eq(courseLessons.courseId, existing.courseId));
  const requiredIds = allLessons.filter((l) => l.isRequired).map((l) => l.id);
  const passedRequired = requiredIds.filter((id) =>
    (nextProgress as Record<string, { status?: string }>)[id]?.status === "passed",
  );
  const courseNowPassed = requiredIds.length > 0 && passedRequired.length === requiredIds.length;

  // Compute aggregate final score (avg of scoreRaw/scoreMax * 100 for
  // lessons that reported a score). Falls back to null when no lessons
  // reported a score (Studio-video lessons without an assessment).
  let scoreSum = 0;
  let scoreCount = 0;
  for (const l of allLessons) {
    const lp = (nextProgress as Record<string, { scoreRaw?: number; scoreMax?: number }>)[l.id];
    if (lp?.scoreRaw != null && lp?.scoreMax && lp.scoreMax > 0) {
      scoreSum += (lp.scoreRaw / lp.scoreMax) * 100;
      scoreCount += 1;
    }
  }
  const finalScorePct = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null;

  const [enrollmentRow] = await db.select({ courseId: courseEnrollments.courseId }).from(courseEnrollments)
    .where(eq(courseEnrollments.id, existing.id)).limit(1);
  const [courseRow] = await db.select({ passingScorePct: courses.passingScorePct, issuesCertificate: courses.issuesCertificate }).from(courses)
    .where(eq(courses.id, enrollmentRow!.courseId)).limit(1);

  const meetsPassingScore = courseRow?.passingScorePct == null
    || (finalScorePct ?? 0) >= courseRow.passingScorePct;
  const flipToPassed = !wasPassed && courseNowPassed && meetsPassingScore;

  const [updated] = await db.update(courseEnrollments).set({
    progress: nextProgress,
    startedAt: existing.startedAt ?? new Date(),
    completedAt: flipToPassed ? new Date() : existing.completedAt,
    passed: flipToPassed ? true : existing.passed,
    finalScorePct,
    updatedAt: new Date(),
  } as any).where(eq(courseEnrollments.id, existing.id)).returning();

  // ── Gamification + cert + path completion fan-out ────────────────
  // Only fire on transitions (not idempotent "passed again" PATCHes).
  if (parsed.data.status === "passed" && prevLessonStatus !== "passed") {
    await withGamification(c, "lesson-completed", (game, role, uid2) =>
      game.onLessonCompleted({
        userId: uid2,
        role,
        courseId: existing.courseId,
        lessonId,
        enrollmentId: existing.id,
      }),
    );
  }

  if (flipToPassed) {
    await db.update(courses)
      .set({ completionCount: sql`${courses.completionCount} + 1` } as any)
      .where(eq(courses.id, existing.courseId))
      .catch(() => undefined);

    await withGamification(c, "course-passed", (game, role, uid2) =>
      game.onCoursePassed({
        userId: uid2,
        role,
        courseId: existing.courseId,
        enrollmentId: existing.id,
        metadata: { finalScorePct },
      }),
    );

    // Auto-issue cert if the course offers one.
    if (courseRow?.issuesCertificate) {
      try {
        const certService = new CertificateService(db, getJwtSecret());
        const issued = await certService.issueForEnrollment(userId, existing.id);
        if (issued?.newlyIssued) {
          await withGamification(c, "certificate-earned", (game, role, uid2) =>
            game.onCertificateEarned({
              userId: uid2,
              role,
              certificateId: issued.certificate.id,
              metadata: { certNumber: issued.certificate.certNumber, courseId: existing.courseId },
            }),
          );
        }
      } catch (e) {
        console.warn("[courses] cert issuance failed", e instanceof Error ? e.message : String(e));
      }
    }

    // Path completion fan-out — for every path this course belongs to,
    // check whether the user has now finished it.
    try {
      const pathSlots = await db.select({ pathId: learningPathCourses.pathId })
        .from(learningPathCourses)
        .where(eq(learningPathCourses.courseId, existing.courseId));
      const role = pickScoringRole(c.var.user?.roles);
      if (role && pathSlots.length > 0) {
        const pathService = new LearningPathService(db);
        const game = gamificationFromContext(c);
        for (const slot of pathSlots) {
          const { newlyCompleted, enrollmentId: pathEnrollmentId } =
            await pathService.maybeCompletePathEnrollment(userId, slot.pathId);
          if (newlyCompleted && pathEnrollmentId) {
            await game.onLearningPathCompleted({
              userId,
              role,
              pathId: slot.pathId,
              enrollmentId: pathEnrollmentId,
            });
          }
        }
      }
    } catch (e) {
      console.warn("[courses] path-completion fan-out failed", e instanceof Error ? e.message : String(e));
    }
  }

  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// Prerequisites (DAG edges)
// ---------------------------------------------------------------------------

const PrerequisiteSchema = z.object({
  prerequisiteCourseId: z.string().uuid(),
});

courseRoutes.get("/:id/prerequisites", async (c) => {
  const db = getDb();
  const courseId = c.req.param("id");
  const service = new LearningPathService(db);
  const prereqIds = await service.listPrerequisites(courseId);
  if (prereqIds.length === 0) return c.json(success([]), 200);
  const rows = await db.select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      coverImageUrl: courses.coverImageUrl,
    })
    .from(courses)
    .where(inArray(courses.id, prereqIds));
  return c.json(success(rows), 200);
});

courseRoutes.post("/:id/prerequisites", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = PrerequisiteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const courseId = c.req.param("id");
  if (!(await ownsCourse(db, userId, courseId))) {
    return c.json(error("NOT_FOUND", "Course not found"), 404);
  }
  // Validate the prereq exists (any visibility — author may chain to a
  // draft of their own; cross-author chaining is allowed).
  const [prereq] = await db.select({ id: courses.id }).from(courses)
    .where(eq(courses.id, parsed.data.prerequisiteCourseId)).limit(1);
  if (!prereq) return c.json(error("VALIDATION_ERROR", "Prerequisite course not found"), 400);

  try {
    const service = new LearningPathService(db);
    const result = await service.addPrerequisite(courseId, parsed.data.prerequisiteCourseId);
    return c.json(success(result), result.created ? 201 : 200);
  } catch (e) {
    return c.json(error("CYCLE", e instanceof Error ? e.message : "Cycle"), 409);
  }
});

courseRoutes.delete("/:id/prerequisites/:prereqId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const courseId = c.req.param("id");
  if (!(await ownsCourse(db, userId, courseId))) {
    return c.json(error("NOT_FOUND", "Course not found"), 404);
  }
  const service = new LearningPathService(db);
  const result = await service.removePrerequisite(courseId, c.req.param("prereqId"));
  return c.json(success(result), 200);
});

// ---------------------------------------------------------------------------
// Certificate issuance + listing
// ---------------------------------------------------------------------------

courseRoutes.post("/enrollments/:enrollmentId/certificate", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const certService = new CertificateService(db, getJwtSecret());
  const result = await certService.issueForEnrollment(userId, c.req.param("enrollmentId"));
  if (!result) {
    return c.json(error("NOT_ELIGIBLE", "Enrollment is not eligible for a certificate (must be passed, and the course must issue certs)."), 409);
  }
  if (result.newlyIssued) {
    await withGamification(c, "certificate-earned", (game, role, uid2) =>
      game.onCertificateEarned({
        userId: uid2,
        role,
        certificateId: result.certificate.id,
        metadata: { certNumber: result.certificate.certNumber },
      }),
    );
  }
  return c.json(success(result.certificate), result.newlyIssued ? 201 : 200);
});

courseRoutes.get("/me/certificates", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db.select().from(courseCertificates)
    .where(eq(courseCertificates.userId, userId))
    .orderBy(desc(courseCertificates.issuedAt));
  return c.json(success(rows), 200);
});

// ---------------------------------------------------------------------------
// SCORM CMI persistence (#161) — runtime calls this from the lesson player
// ---------------------------------------------------------------------------

const ScormCommitSchema = z.object({
  lessonId: z.string().uuid(),
  scormVersion: z.enum(SCORM_VERSIONS),
  cmi: z.record(z.unknown()),
  completionStatus: z.enum(SCORM_COMPLETION_STATUSES).optional(),
  scoreRaw: z.number().optional(),
  scoreMin: z.number().optional(),
  scoreMax: z.number().optional(),
  totalTimeSec: z.number().int().min(0).optional(),
  suspendData: z.string().optional(),
});

courseRoutes.post("/scorm/:enrollmentId/commit", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ScormCommitSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const enrollmentId = c.req.param("enrollmentId");
  // Authorise via enrollment ownership.
  const [enrollment] = await db.select({ id: courseEnrollments.id, courseId: courseEnrollments.courseId })
    .from(courseEnrollments)
    .where(and(
      eq(courseEnrollments.id, enrollmentId),
      eq(courseEnrollments.userId, userId),
    ))
    .limit(1);
  if (!enrollment) return c.json(error("NOT_FOUND", "Enrollment not found"), 404);

  // Lesson must belong to the enrollment's course.
  const [lesson] = await db.select({ id: courseLessons.id })
    .from(courseLessons)
    .where(and(
      eq(courseLessons.id, parsed.data.lessonId),
      eq(courseLessons.courseId, enrollment.courseId),
    ))
    .limit(1);
  if (!lesson) return c.json(error("NOT_FOUND", "Lesson not found on this course"), 404);

  const [existing] = await db.select().from(scormCmiStates)
    .where(and(
      eq(scormCmiStates.enrollmentId, enrollmentId),
      eq(scormCmiStates.lessonId, parsed.data.lessonId),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db.update(scormCmiStates).set({
      cmi: parsed.data.cmi,
      completionStatus: parsed.data.completionStatus ?? existing.completionStatus,
      scoreRaw: parsed.data.scoreRaw ?? existing.scoreRaw,
      scoreMin: parsed.data.scoreMin ?? existing.scoreMin,
      scoreMax: parsed.data.scoreMax ?? existing.scoreMax,
      totalTimeSec: parsed.data.totalTimeSec ?? existing.totalTimeSec,
      suspendData: parsed.data.suspendData ?? existing.suspendData,
      scormVersion: parsed.data.scormVersion,
      updatedAt: new Date(),
    } as never).where(eq(scormCmiStates.id, existing.id)).returning();
    return c.json(success(updated), 200);
  }

  const [created] = await db.insert(scormCmiStates).values({
    enrollmentId,
    lessonId: parsed.data.lessonId,
    scormVersion: parsed.data.scormVersion,
    cmi: parsed.data.cmi,
    completionStatus: parsed.data.completionStatus ?? null,
    scoreRaw: parsed.data.scoreRaw ?? null,
    scoreMin: parsed.data.scoreMin ?? null,
    scoreMax: parsed.data.scoreMax ?? null,
    totalTimeSec: parsed.data.totalTimeSec ?? 0,
    suspendData: parsed.data.suspendData ?? null,
  } as never).returning();
  return c.json(success(created), 201);
});

courseRoutes.get("/scorm/:enrollmentId/:lessonId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [enrollment] = await db.select({ id: courseEnrollments.id })
    .from(courseEnrollments)
    .where(and(
      eq(courseEnrollments.id, c.req.param("enrollmentId")),
      eq(courseEnrollments.userId, userId),
    ))
    .limit(1);
  if (!enrollment) return c.json(error("NOT_FOUND", "Enrollment not found"), 404);

  const [row] = await db.select().from(scormCmiStates)
    .where(and(
      eq(scormCmiStates.enrollmentId, c.req.param("enrollmentId")),
      eq(scormCmiStates.lessonId, c.req.param("lessonId")),
    ))
    .limit(1);
  return c.json(success(row ?? null), 200);
});

// ---------------------------------------------------------------------------
// xAPI / Tin Can statement ingest (#161 sub) — accepts statements from the
// Studio-video lesson player as well as SCORM runtimes. Single internal LRS
// table; external-LRS mirroring lands later for enterprise customers.
// ---------------------------------------------------------------------------

const XapiStatementSchema = z.object({
  enrollmentId: z.string().uuid().optional(),
  lessonId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  verb: z.object({
    id: z.string().min(1).max(255),
    display: z.string().max(80).optional(),
  }),
  object: z.object({
    id: z.string().min(1).max(255),
    objectType: z.string().max(40).optional(),
  }),
  result: z.object({
    score: z.object({ scaled: z.number().optional(), raw: z.number().optional() }).optional(),
    success: z.boolean().optional(),
    completion: z.boolean().optional(),
    duration: z.string().optional(),
  }).optional(),
  context: z.record(z.unknown()).optional(),
  timestamp: z.string().optional(),
});

courseRoutes.post("/xapi/statements", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = XapiStatementSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  // Authorise enrollment ownership when one is provided.
  if (parsed.data.enrollmentId) {
    const [e] = await db.select({ id: courseEnrollments.id })
      .from(courseEnrollments)
      .where(and(
        eq(courseEnrollments.id, parsed.data.enrollmentId),
        eq(courseEnrollments.userId, userId),
      ))
      .limit(1);
    if (!e) return c.json(error("NOT_FOUND", "Enrollment not found"), 404);
  }

  const resultScore = parsed.data.result?.score?.scaled
    ?? parsed.data.result?.score?.raw
    ?? null;

  const [created] = await db.insert(xapiStatements).values({
    userId,
    enrollmentId: parsed.data.enrollmentId ?? null,
    lessonId: parsed.data.lessonId ?? null,
    courseId: parsed.data.courseId ?? null,
    verbId: parsed.data.verb.id,
    verbDisplay: parsed.data.verb.display ?? null,
    objectId: parsed.data.object.id,
    objectType: parsed.data.object.objectType ?? "Activity",
    resultScore,
    resultSuccess: parsed.data.result?.success ?? null,
    statement: parsed.data as Record<string, unknown>,
  } as never).returning({ id: xapiStatements.id });

  // If this xAPI statement is a passed/completed verb against a known
  // lesson, mirror it into PATCH-progress so the gamification + cert
  // pipeline fires once. We don't double-fire — the dedup-uniq on the
  // lesson-completed action collapses repeats.
  const isCompletion = parsed.data.verb.id === XAPI_VERBS.PASSED.id
    || parsed.data.verb.id === XAPI_VERBS.COMPLETED.id;
  if (isCompletion && parsed.data.enrollmentId && parsed.data.lessonId) {
    await withGamification(c, "xapi-completed", (game, role, uid2) =>
      game.onLessonCompleted({
        userId: uid2,
        role,
        courseId: parsed.data.courseId ?? "",
        lessonId: parsed.data.lessonId!,
        enrollmentId: parsed.data.enrollmentId!,
      }),
    );
  }

  return c.json(success({ id: created!.id }), 201);
});
