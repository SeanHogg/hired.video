/**
 * Learning paths — curated multi-course "journeys" with DAG-style
 * prerequisite chaining (see migration 0126 + LearningPathService).
 *
 * Authoring eligibility (per project_creator_persona_model + the
 * 2026-05-25 design decision recorded in project_learning_pathways):
 * creator-program enrollees OR users with `employer` in their JWT
 * `roles` array. Employers publish internal training without becoming
 * creators — courses + paths authored this way carry
 * `is_employer_authored=true` and stay off the public marketplace
 * unless explicitly published.
 *
 * Routes:
 *   Owner
 *     POST   /api/learning-paths                       — create draft
 *     GET    /api/learning-paths/me                    — my paths
 *     GET    /api/learning-paths/:id                   — get my path
 *     PATCH  /api/learning-paths/:id
 *     POST   /api/learning-paths/:id/publish
 *     POST   /api/learning-paths/:id/unpublish
 *     DELETE /api/learning-paths/:id
 *     POST   /api/learning-paths/:id/courses           — attach course
 *     PATCH  /api/learning-paths/:id/courses/:courseId — update slot
 *     DELETE /api/learning-paths/:id/courses/:courseId
 *
 *   Public
 *     GET    /api/learning-paths/public                — published feed
 *     GET    /api/learning-paths/public/:id            — detail
 *
 *   Learner
 *     POST   /api/learning-paths/:id/enroll
 *     GET    /api/learning-paths/me/enrollments
 *     GET    /api/learning-paths/:id/progress          — unlock state +
 *                                                       per-course pass
 */
import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { slugify } from "../../../shared/slugify.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { LearningPathService } from "../services/learning/learning-path-service.js";

const {
  courses,
  creatorProfiles,
  learningPaths,
  learningPathCourses,
  learningPathEnrollments,
} = schema;

export const learningPathRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function roles(c: any): string[] {
  const r = c.var.user?.roles;
  return Array.isArray(r) ? (r as string[]) : [];
}

/** Course/path authoring is open to creator-program enrollees AND any
 *  user holding the `employer` role. Returns `{ authored: true, kind }`
 *  on success so callers can stamp `is_employer_authored`. */
async function checkAuthorEligibility(
  db: ReturnType<typeof getDb>,
  c: any,
): Promise<
  | { ok: true; isEmployerAuthored: boolean }
  | { ok: false }
> {
  const userId = uid(c);
  if (!userId) return { ok: false };

  if (roles(c).includes(USER_ROLES.EMPLOYER)) {
    return { ok: true, isEmployerAuthored: true };
  }

  const [creator] = await db.select()
    .from(creatorProfiles)
    .where(and(
      eq(creatorProfiles.userId, userId),
      sql`${creatorProfiles.endedAt} IS NULL`,
      eq(creatorProfiles.coursesActive, true),
    ))
    .limit(1);
  if (creator) return { ok: true, isEmployerAuthored: false };
  return { ok: false };
}

// ── Validators ────────────────────────────────────────────────────────────

const CreatePathSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().max(1000).optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  issuesCertificate: z.boolean().optional(),
});

const UpdatePathSchema = CreatePathSchema.partial().extend({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),
});

export const AttachCourseSchema = z.object({
  courseId: UuidLikeSchema,
  displayOrder: z.number().int().min(0).optional(),
  isRequired: z.boolean().optional(),
});

const UpdatePathCourseSchema = z.object({
  displayOrder: z.number().int().min(0).optional(),
  isRequired: z.boolean().optional(),
});

// ── Public ─────────────────────────────────────────────────────────────────
// Registered before /:id so Hono doesn't capture `/public` as id="public".

learningPathRoutes.get("/public", async (c) => {
  const db = getDb();
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, 100);
  try {
    const rows = await db
      .select()
      .from(learningPaths)
      .where(eq(learningPaths.status, "published"))
      .orderBy(desc(learningPaths.publishedAt))
      .limit(limit);
    return c.json(success(rows), 200);
  } catch {
    return c.json(success([] as unknown[]), 200);
  }
});

learningPathRoutes.get("/public/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const [path] = await db.select().from(learningPaths)
    .where(and(eq(learningPaths.id, id), eq(learningPaths.status, "published")))
    .limit(1);
  if (!path) return c.json(error("NOT_FOUND", "Path not found"), 404);

  const slots = await db.select({
      slot: learningPathCourses,
      course: courses,
    })
    .from(learningPathCourses)
    .innerJoin(courses, eq(courses.id, learningPathCourses.courseId))
    .where(eq(learningPathCourses.pathId, path.id))
    .orderBy(learningPathCourses.displayOrder);

  return c.json(success({
    path,
    courses: slots.map((s) => ({
      slot: s.slot,
      course: {
        id: s.course.id,
        title: s.course.title,
        slug: s.course.slug,
        summary: s.course.summary,
        coverImageUrl: s.course.coverImageUrl,
        estimatedMinutes: s.course.estimatedMinutes,
        difficulty: s.course.difficulty,
        priceCents: s.course.priceVisible ? s.course.priceCents : null,
        issuesCertificate: s.course.issuesCertificate,
      },
    })),
  }), 200);
});

// ── Owner ──────────────────────────────────────────────────────────────────

learningPathRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreatePathSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const eligibility = await checkAuthorEligibility(db, c);
  if (!eligibility.ok) {
    return c.json(error(
      "AUTHORING_NOT_ELIGIBLE",
      "Authoring paths requires the Courses Creator Program or an employer role.",
    ), 403);
  }

  const baseSlug = slugify(parsed.data.title, { fallback: () => `path-${Date.now()}` });
  let slug = baseSlug;
  for (let n = 1; n <= 50; n++) {
    const [exists] = await db.select({ id: learningPaths.id })
      .from(learningPaths)
      .where(and(eq(learningPaths.userId, userId), eq(learningPaths.slug, slug)))
      .limit(1);
    if (!exists) break;
    slug = `${baseSlug}-${n + 1}`;
  }

  const [created] = await db.insert(learningPaths).values({
    userId,
    slug,
    title: parsed.data.title,
    summary: parsed.data.summary ?? null,
    description: parsed.data.description ?? null,
    coverImageUrl: parsed.data.coverImageUrl ?? null,
    category: parsed.data.category ?? null,
    tags: parsed.data.tags ?? [],
    difficulty: parsed.data.difficulty ?? null,
    issuesCertificate: parsed.data.issuesCertificate ?? false,
    isEmployerAuthored: eligibility.isEmployerAuthored,
    status: "draft",
  } as never).returning();
  return c.json(success(created), 201);
});

learningPathRoutes.get("/me", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db.select().from(learningPaths)
    .where(eq(learningPaths.userId, userId))
    .orderBy(desc(learningPaths.updatedAt));
  return c.json(success(rows), 200);
});

learningPathRoutes.get("/me/enrollments", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select({ enrollment: learningPathEnrollments, path: learningPaths })
    .from(learningPathEnrollments)
    .innerJoin(learningPaths, eq(learningPaths.id, learningPathEnrollments.pathId))
    .where(eq(learningPathEnrollments.userId, userId))
    .orderBy(desc(learningPathEnrollments.enrolledAt));
  return c.json(success(rows), 200);
});

learningPathRoutes.get("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const id = c.req.param("id");
  const [path] = await db.select().from(learningPaths)
    .where(and(eq(learningPaths.id, id), eq(learningPaths.userId, userId)))
    .limit(1);
  if (!path) return c.json(error("NOT_FOUND", "Path not found"), 404);
  const slots = await db.select({ slot: learningPathCourses, course: courses })
    .from(learningPathCourses)
    .innerJoin(courses, eq(courses.id, learningPathCourses.courseId))
    .where(eq(learningPathCourses.pathId, id))
    .orderBy(learningPathCourses.displayOrder);
  return c.json(success({ path, courses: slots }), 200);
});

learningPathRoutes.patch("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = UpdatePathSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of [
    "title", "summary", "description", "coverImageUrl", "category", "tags",
    "difficulty", "issuesCertificate", "slug",
  ] as const) {
    if (k in parsed.data) (patch as any)[k] = (parsed.data as any)[k];
  }
  const [updated] = await db.update(learningPaths).set(patch as never)
    .where(and(eq(learningPaths.id, c.req.param("id")), eq(learningPaths.userId, userId)))
    .returning();
  if (!updated) return c.json(error("NOT_FOUND", "Path not found"), 404);
  return c.json(success(updated), 200);
});

learningPathRoutes.post("/:id/publish", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const id = c.req.param("id");
  const [existing] = await db.select().from(learningPaths)
    .where(and(eq(learningPaths.id, id), eq(learningPaths.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Path not found"), 404);

  const slotCount = await db.select({ n: sql<number>`count(*)::int` })
    .from(learningPathCourses)
    .where(eq(learningPathCourses.pathId, id));
  if ((slotCount[0]?.n ?? 0) === 0) {
    return c.json(error("VALIDATION_ERROR", "Attach at least one course before publishing."), 400);
  }
  const [updated] = await db.update(learningPaths).set({
    status: "published",
    publishedAt: new Date(),
    updatedAt: new Date(),
  } as never).where(eq(learningPaths.id, id)).returning();
  return c.json(success(updated), 200);
});

learningPathRoutes.post("/:id/unpublish", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [updated] = await db.update(learningPaths)
    .set({ status: "draft", publishedAt: null, updatedAt: new Date() } as never)
    .where(and(eq(learningPaths.id, c.req.param("id")), eq(learningPaths.userId, userId)))
    .returning();
  if (!updated) return c.json(error("NOT_FOUND", "Path not found"), 404);
  return c.json(success(updated), 200);
});

learningPathRoutes.delete("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [deleted] = await db.delete(learningPaths)
    .where(and(eq(learningPaths.id, c.req.param("id")), eq(learningPaths.userId, userId)))
    .returning({ id: learningPaths.id });
  if (!deleted) return c.json(error("NOT_FOUND", "Path not found"), 404);
  return c.json(success({ deleted: deleted.id }), 200);
});

// ── Path → courses ─────────────────────────────────────────────────────────

learningPathRoutes.post("/:id/courses", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = AttachCourseSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const pathId = c.req.param("id");
  const [path] = await db.select({ id: learningPaths.id }).from(learningPaths)
    .where(and(eq(learningPaths.id, pathId), eq(learningPaths.userId, userId)))
    .limit(1);
  if (!path) return c.json(error("NOT_FOUND", "Path not found"), 404);

  const [created] = await db.insert(learningPathCourses).values({
    pathId,
    courseId: parsed.data.courseId,
    displayOrder: parsed.data.displayOrder ?? 0,
    isRequired: parsed.data.isRequired ?? true,
  } as never).onConflictDoNothing().returning();
  if (!created) return c.json(error("CONFLICT", "Course already attached to path"), 409);
  return c.json(success(created), 201);
});

learningPathRoutes.patch("/:id/courses/:courseId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = UpdatePathCourseSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const pathId = c.req.param("id");
  const courseId = c.req.param("courseId");
  const [path] = await db.select({ id: learningPaths.id }).from(learningPaths)
    .where(and(eq(learningPaths.id, pathId), eq(learningPaths.userId, userId)))
    .limit(1);
  if (!path) return c.json(error("NOT_FOUND", "Path not found"), 404);

  const patch: Record<string, unknown> = {};
  if ("displayOrder" in parsed.data) patch.displayOrder = parsed.data.displayOrder;
  if ("isRequired" in parsed.data) patch.isRequired = parsed.data.isRequired;
  if (Object.keys(patch).length === 0) {
    return c.json(error("VALIDATION_ERROR", "No fields to update"), 400);
  }
  const [updated] = await db.update(learningPathCourses).set(patch as never)
    .where(and(
      eq(learningPathCourses.pathId, pathId),
      eq(learningPathCourses.courseId, courseId),
    ))
    .returning();
  if (!updated) return c.json(error("NOT_FOUND", "Slot not found"), 404);
  return c.json(success(updated), 200);
});

learningPathRoutes.delete("/:id/courses/:courseId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const pathId = c.req.param("id");
  const courseId = c.req.param("courseId");
  const [path] = await db.select({ id: learningPaths.id }).from(learningPaths)
    .where(and(eq(learningPaths.id, pathId), eq(learningPaths.userId, userId)))
    .limit(1);
  if (!path) return c.json(error("NOT_FOUND", "Path not found"), 404);
  const [deleted] = await db.delete(learningPathCourses)
    .where(and(
      eq(learningPathCourses.pathId, pathId),
      eq(learningPathCourses.courseId, courseId),
    ))
    .returning({ id: learningPathCourses.id });
  if (!deleted) return c.json(error("NOT_FOUND", "Slot not found"), 404);
  return c.json(success({ deleted: deleted.id }), 200);
});

// ── Learner ────────────────────────────────────────────────────────────────

learningPathRoutes.post("/:id/enroll", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const pathId = c.req.param("id");
  const [path] = await db.select().from(learningPaths)
    .where(and(eq(learningPaths.id, pathId), eq(learningPaths.status, "published")))
    .limit(1);
  if (!path) return c.json(error("NOT_FOUND", "Path not found"), 404);

  const [existing] = await db.select().from(learningPathEnrollments)
    .where(and(
      eq(learningPathEnrollments.userId, userId),
      eq(learningPathEnrollments.pathId, pathId),
    ))
    .limit(1);
  if (existing) return c.json(success(existing), 200);

  const [created] = await db.insert(learningPathEnrollments).values({
    pathId,
    userId,
  } as never).returning();

  await db.update(learningPaths)
    .set({ enrollmentCount: sql`${learningPaths.enrollmentCount} + 1` } as never)
    .where(eq(learningPaths.id, pathId))
    .catch(() => undefined);

  return c.json(success(created), 201);
});

learningPathRoutes.get("/:id/progress", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const pathId = c.req.param("id");

  const slots = await db.select({ courseId: learningPathCourses.courseId })
    .from(learningPathCourses)
    .where(eq(learningPathCourses.pathId, pathId));
  const courseIds = slots.map((s) => s.courseId);
  if (courseIds.length === 0) {
    return c.json(success({ unlocked: [], passed: [], locked: [], complete: false }), 200);
  }
  const service = new LearningPathService(db);
  const [unlockState, completion] = await Promise.all([
    service.computeUnlockState(userId, courseIds),
    service.isPathComplete(userId, pathId),
  ]);
  return c.json(success({
    unlocked: [...unlockState.unlocked],
    passed: [...unlockState.passed],
    locked: [...unlockState.locked.entries()].map(([cid, missing]) => ({ courseId: cid, missing })),
    complete: completion.complete,
  }), 200);
});
