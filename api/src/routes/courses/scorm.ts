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
import { invalidBody, respond } from "./shared.js";
import { validateJson } from "../helpers/validate.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const courseScormRoutes = new Hono<AppEnv>();

courseScormRoutes.post("/scorm/:enrollmentId/commit", validateJson(ScormCommitSchema, invalidBody), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const { state, created } = await commitScormState(userId, c.req.param("enrollmentId"), body);
  return c.json(success(state), created ? 201 : 200);
});

courseScormRoutes.get("/scorm/:enrollmentId/:lessonId", (c) => {
  const userId = requireUser(c);
  return respond(c, async () =>
    (await getScormState(userId, c.req.param("enrollmentId"), c.req.param("lessonId"))) ?? null,
  );
});
