/**
 * SCORM CMI persistence (#161) — called by the lesson player runtime:
 *   POST /api/courses/scorm/:enrollmentId/commit      — upsert CMI state
 *   GET  /api/courses/scorm/:enrollmentId/:lessonId   — saved CMI state (or null)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { commitScormState, getScormState } from "../../services/courses/scormRuntimeService.js";
import { ScormCommitSchema } from "./schemas.js";
import { handle, readBody, respond, uid, unauthorized, validationError } from "./shared.js";

export const courseScormRoutes = new Hono<AppEnv>();

courseScormRoutes.post("/scorm/:enrollmentId/commit", async (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  const parsed = ScormCommitSchema.safeParse(await readBody(c));
  if (!parsed.success) return validationError(c, parsed.error);
  return handle(c, async () => {
    const { state, created } = await commitScormState(userId, c.req.param("enrollmentId"), parsed.data);
    return c.json(success(state), created ? 201 : 200);
  });
});

courseScormRoutes.get("/scorm/:enrollmentId/:lessonId", (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  return respond(c, async () =>
    (await getScormState(userId, c.req.param("enrollmentId"), c.req.param("lessonId"))) ?? null,
  );
});
