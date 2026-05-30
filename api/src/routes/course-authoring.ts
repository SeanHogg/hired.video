/**
 * Course authoring helper routes — bundles three gap-register entries
 * that all sit between the course-editor UI and the existing courses
 * write path:
 *
 *   • #162 — POST /api/courses/generate           (AI lesson tree generator)
 *   • #200 — /api/courses/lms/connectors          (CRUD)
 *           — POST /api/courses/:id/publish-to-lms (push to connected LMS)
 *
 * #167 (course-review state machine) is one varchar column transition in
 * the COURSE_STATUSES enum + reuse of studio_review_comments; the
 * existing /api/courses/:id/publish handler covers the writer side. The
 * reviewer-side UI mounts under `/studio/projects/:id/reviews` which
 * already supports a `subjectKind='course'` link.
 */
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { getDb, schema } from "../db/index.js";
import { success, error } from "../types/index.js";
import type { AppEnv } from "../types/index.js";
import { generateCourse, CourseGenInputSchema } from "../services/courses/course-generator.js";
import { createLLMClient, toClientUsage } from "../services/adapters/llm-client.js";
import { connectorFor } from "../services/lms/index.js";
import { LMS_PROVIDERS } from "../db/schema/courses.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";

const { lmsConnectors, lmsCoursePublishes, courses } = schema;

export const courseAuthoringRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

// ===========================================================================
// #162 — AI course generator
// ===========================================================================

courseAuthoringRoutes.post("/generate", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = CourseGenInputSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
  const env = (c.env as any) ?? {};
  const llm = createLLMClient(env, c.var.user ?? null);
  try {
    const result = await generateCourse({ llm, input: parsed.data });
    return c.json(success({ course: result.data, usage: toClientUsage(result.usage) }), 200);
  } catch (e) {
    return c.json(error("GENERATOR_FAILED", e instanceof Error ? e.message : String(e)), 500);
  }
});

// ===========================================================================
// #200 — LMS connector management (per-user). OAuth callback paths are
// per-provider and land elsewhere (api/src/routes/oauth.ts is the
// canonical handler); these endpoints expose the connected list +
// status check + revoke.
// ===========================================================================

courseAuthoringRoutes.get("/lms/connectors", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db.select({
    id: lmsConnectors.id,
    provider: lmsConnectors.provider,
    displayName: lmsConnectors.displayName,
    status: lmsConnectors.status,
    lastSyncAt: lmsConnectors.lastSyncAt,
    lastError: lmsConnectors.lastError,
    createdAt: lmsConnectors.createdAt,
  }).from(lmsConnectors)
    .where(eq(lmsConnectors.userId, userId))
    .orderBy(desc(lmsConnectors.createdAt));
  return c.json(success({ connectors: rows, providers: LMS_PROVIDERS }), 200);
});

courseAuthoringRoutes.post("/lms/connectors/:id/revoke", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [updated] = await db.update(lmsConnectors)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(and(eq(lmsConnectors.id, c.req.param("id")), eq(lmsConnectors.userId, userId)))
    .returning();
  if (!updated) return c.json(error("NOT_FOUND", "Connector not found"), 404);
  return c.json(success(updated), 200);
});

const PublishToLmsSchema = z.object({
  connectorId: UuidLikeSchema,
  scormPackageUrl: z.string().url(),
});

courseAuthoringRoutes.post("/:id/publish-to-lms", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = PublishToLmsSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
  const db = getDb();

  // Owner OR SuperAdmin can publish-to-LMS. SA case is unusual but
  // legitimate — e.g. seeded platform courses pushed to a partner LMS.
  const courseFilter = isSuperAdmin(c.var.user)
    ? eq(courses.id, c.req.param("id"))
    : and(eq(courses.id, c.req.param("id")), eq(courses.userId, userId));
  const [course] = await db.select().from(courses).where(courseFilter).limit(1);
  if (!course) return c.json(error("NOT_FOUND", "Course not found"), 404);

  const [conn] = await db.select().from(lmsConnectors)
    .where(and(eq(lmsConnectors.id, parsed.data.connectorId), eq(lmsConnectors.userId, userId)))
    .limit(1);
  if (!conn || conn.status !== "connected") {
    return c.json(error("FORBIDDEN", "Connector is not active"), 403);
  }

  const [publishRow] = await db.insert(lmsCoursePublishes).values({
    connectorId: conn.id,
    courseId: course.id,
    status: "pending",
  }).returning();

  try {
    const adapter = connectorFor(conn.provider as any);
    const result = await adapter.publishCourse(
      {
        title: course.title,
        description: course.description ?? course.summary ?? undefined,
        scormPackageUrl: parsed.data.scormPackageUrl,
        externalId: course.slug,
        tags: course.tags as string[],
        category: course.category ?? undefined,
      },
      {
        accessToken: conn.accessToken ?? "",
        baseUrl: conn.baseUrl ?? "",
        metadata: (conn.metadata as Record<string, unknown>) ?? {},
      },
    );
    const [done] = await db.update(lmsCoursePublishes)
      .set({
        externalId: result.remoteId,
        status: "published",
        pushedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(lmsCoursePublishes.id, publishRow.id))
      .returning();
    return c.json(success({ publish: done, launchUrl: result.launchUrl }), 200);
  } catch (e) {
    await db.update(lmsCoursePublishes)
      .set({
        status: "failed",
        lastError: e instanceof Error ? e.message : String(e),
        updatedAt: new Date(),
      })
      .where(eq(lmsCoursePublishes.id, publishRow.id));
    return c.json(error("LMS_PUBLISH_FAILED", e instanceof Error ? e.message : String(e)), 500);
  }
});

courseAuthoringRoutes.get("/:id/lms-publishes", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [course] = await db.select({ userId: courses.userId })
    .from(courses).where(eq(courses.id, c.req.param("id"))).limit(1);
  if (!course || course.userId !== userId) {
    return c.json(error("NOT_FOUND", "Course not found"), 404);
  }
  const rows = await db.select().from(lmsCoursePublishes)
    .where(eq(lmsCoursePublishes.courseId, c.req.param("id")))
    .orderBy(desc(lmsCoursePublishes.createdAt));
  return c.json(success({ publishes: rows }), 200);
});
