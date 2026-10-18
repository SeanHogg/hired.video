/**
 * Owner course content — modules + lessons (authorised via the parent course):
 *   POST   /api/courses/:id/modules
 *   PATCH  /api/courses/modules/:moduleId
 *   DELETE /api/courses/modules/:moduleId
 *   POST   /api/courses/:id/lessons
 *   PATCH  /api/courses/lessons/:lessonId
 *   DELETE /api/courses/lessons/:lessonId   — also cleans the SCORM R2 prefix
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import {
  addLesson,
  addModule,
  deleteLesson,
  deleteModule,
  updateLesson,
  updateModule,
} from "../../services/courses/courseContentService.js";
import {
  CreateLessonSchema,
  CreateModuleSchema,
  UpdateLessonSchema,
  UpdateModuleSchema,
} from "./schemas.js";
import { courseActor, invalidBody, respond, unauthorized } from "./shared.js";
import { validateJson } from "../helpers/validate.js";

export const courseContentRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

courseContentRoutes.post("/:id/modules", validateJson(CreateModuleSchema, invalidBody), async (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  const body = c.req.valid("json");
  return respond(c, () => addModule(actor, c.req.param("id"), body), 201);
});

courseContentRoutes.patch("/modules/:moduleId", validateJson(UpdateModuleSchema, invalidBody), async (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  const body = c.req.valid("json");
  return respond(c, () => updateModule(actor, c.req.param("moduleId"), body));
});

courseContentRoutes.delete("/modules/:moduleId", (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  const moduleId = c.req.param("moduleId");
  return respond(c, async () => {
    await deleteModule(actor, moduleId);
    return { deleted: moduleId };
  });
});

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

courseContentRoutes.post("/:id/lessons", validateJson(CreateLessonSchema, invalidBody), async (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  const body = c.req.valid("json");
  return respond(c, () => addLesson(actor, c.req.param("id"), body), 201);
});

courseContentRoutes.patch("/lessons/:lessonId", validateJson(UpdateLessonSchema, invalidBody), async (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  const body = c.req.valid("json");
  return respond(c, () => updateLesson(actor, c.req.param("lessonId"), body));
});

courseContentRoutes.delete("/lessons/:lessonId", (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  const lessonId = c.req.param("lessonId");
  return respond(c, async () => {
    await deleteLesson(actor, lessonId);
    return { deleted: lessonId };
  });
});
