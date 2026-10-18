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
 * the COURSE_STATUSES enum + reuse of the studio review comments (`comments`); the
 * existing /api/courses/:id/publish handler covers the writer side. The
 * reviewer-side UI mounts under `/studio/projects/:id/reviews` which
 * already supports a `subjectKind='course'` link.
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { success, error } from "../types/index.js";
import type { AppEnv } from "../types/index.js";
import { generateCourse, CourseGenInputSchema } from "../services/courses/course-generator.js";
import { createLLMClient, toClientUsage } from "../services/adapters/llm-client.js";
import { LmsConnectors } from "../services/provider-connections/lms-connectors.js";
import { LMS_PROVIDERS, publishCourseToLms, listCourseLmsPublishes } from "../services/courses/lmsPublishService.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const courseAuthoringRoutes = new Hono<AppEnv>();

// ===========================================================================
// #162 — AI course generator
// ===========================================================================

courseAuthoringRoutes.post("/generate", validateJson(CourseGenInputSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const env = (c.env as any) ?? {};
  const llm = createLLMClient(env, c.var.user ?? null);
  try {
    const result = await generateCourse({ llm, input: body });
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
  const userId = requireUser(c);
  const rows = (await new LmsConnectors().listForUser(userId)).map((r) => ({
    id: r.id,
    provider: r.provider,
    displayName: r.displayName,
    status: r.status,
    lastSyncAt: r.lastSyncAt,
    lastError: r.lastError,
    createdAt: r.createdAt,
  }));
  return c.json(success({ connectors: rows, providers: LMS_PROVIDERS }), 200);
});

courseAuthoringRoutes.post("/lms/connectors/:id/revoke", async (c) => {
  const userId = requireUser(c);
  const updated = await new LmsConnectors().revoke(c.req.param("id"), userId);
  if (!updated) return c.json(error("NOT_FOUND", "Connector not found"), 404);
  return c.json(success(updated), 200);
});

const PublishToLmsSchema = z.object({
  connectorId: UuidLikeSchema,
  scormPackageUrl: z.string().url(),
});

courseAuthoringRoutes.post("/:id/publish-to-lms", validateJson(PublishToLmsSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  // Owner OR SuperAdmin can publish-to-LMS. SA case is unusual but
  // legitimate — e.g. seeded platform courses pushed to a partner LMS.
  const ownerId = isSuperAdmin(c.var.user) ? null : userId;
  return c.json(success(await publishCourseToLms(c.req.param("id"), userId, ownerId, body)), 200);
});

courseAuthoringRoutes.get("/:id/lms-publishes", async (c) => {
  const userId = requireUser(c);
  return c.json(success({ publishes: await listCourseLmsPublishes(c.req.param("id"), userId) }), 200);
});
