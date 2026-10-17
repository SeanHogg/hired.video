/**
 * Internal xAPI / Tin Can statement ingest (#161 sub) — JWT-authenticated.
 * Accepts statements from the Studio-video lesson player as well as SCORM
 * runtimes for the signed-in learner (single internal `xapi_statements`
 * table); every statement is mirrored to the learner's active external LRS
 * targets (see targets.ts).
 *
 *   POST /statements
 *
 * Distinct from the conformant LRS (`/lrs/statements`, Basic-auth) that
 * external tools write to.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../../../types/index.js";
import { success, error } from "../../../types/index.js";
import { XAPI_VERBS } from "../../../db/schema/learning.js";
import { UuidLikeSchema } from "../../../../../shared/validation.js";
import { withGamification } from "../../../domains/gamification/with-gamification.js";
import { ingestInternalStatement } from "../../../services/learning/xapi-use-cases.js";

export const xapiStatementRoutes = new Hono<{ Variables: Variables } & AppEnv>();

export const XapiStatementSchema = z.object({
  enrollmentId: UuidLikeSchema.optional(),
  lessonId: UuidLikeSchema.optional(),
  courseId: UuidLikeSchema.optional(),
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
  context: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().optional(),
});

xapiStatementRoutes.post("/statements", async (c) => {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = XapiStatementSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const data = parsed.data;
  const id = await ingestInternalStatement(userId, data);
  if (!id) return c.json(error("NOT_FOUND", "Enrollment not found"), 404);

  // A passed/completed verb against a known lesson mirrors into the lesson-
  // completed pipeline so gamification + certs fire once (the dedup-uniq on
  // the lesson-completed action collapses repeats).
  const isCompletion = data.verb.id === XAPI_VERBS.PASSED.id || data.verb.id === XAPI_VERBS.COMPLETED.id;
  if (isCompletion && data.enrollmentId && data.lessonId) {
    await withGamification(c, "xapi-completed", (game, role, uid2) =>
      game.onLessonCompleted({
        userId: uid2,
        role,
        courseId: data.courseId ?? "",
        lessonId: data.lessonId!,
        enrollmentId: data.enrollmentId!,
      }),
    );
  }

  return c.json(success({ id }), 201);
});
