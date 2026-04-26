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
 *     GET    /api/courses/public/:userId/:slug  — public course detail
 *
 *   Learner
 *     POST   /api/courses/:id/enroll            — enrol current user (free courses only for now)
 *     GET    /api/courses/me/enrollments        — my enrolments
 *     PATCH  /api/courses/enrollments/:enrollmentId/progress  — update lesson progress
 */
import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  COURSE_LESSON_SOURCE_TYPES,
  COURSE_DIFFICULTIES,
  SCORM_VERSIONS,
} from "../db/schema/courses.js";

const {
  courses,
  courseModules,
  courseLessons,
  courseEnrollments,
  creatorProfiles,
  users,
  userProfiles,
} = schema;

export const courseRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `course-${Date.now()}`;
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
  } catch (e) {
    return c.json(success([] as unknown[]), 200);
  }
});

courseRoutes.get("/public/:userId/:slug", async (c) => {
  const db = getDb();
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
      eq(courses.userId, c.req.param("userId")),
      eq(courses.slug, c.req.param("slug")),
      eq(courses.status, "published"),
      eq(users.emailVerified, true),
    ))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Course not found"), 404);

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

  const enrollment = await getCoursesEnrollment(db, userId);
  if (!enrollment) {
    return c.json(
      error(
        "PROGRAM_NOT_ENROLLED",
        "Authoring courses requires enrollment in the Courses Creator Program. Visit /services to enroll.",
      ),
      403,
    );
  }

  // Unique slug per author.
  const baseSlug = slugify(parsed.data.title);
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

  const enrollment = await getCoursesEnrollment(db, userId);
  if (!enrollment) {
    return c.json(error("PROGRAM_NOT_ENROLLED", "Re-enable the Courses Creator Program at /services to publish."), 403);
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

  const [updated] = await db.update(courses).set({
    status: "published",
    publishedAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(courses.id, existing.id)).returning();
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
  const now = new Date().toISOString();
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

  const [updated] = await db.update(courseEnrollments).set({
    progress: nextProgress,
    startedAt: existing.startedAt ?? new Date(),
    updatedAt: new Date(),
  } as any).where(eq(courseEnrollments.id, existing.id)).returning();

  return c.json(success(updated), 200);
});
