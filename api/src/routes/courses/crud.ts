/**
 * Owner course CRUD + lifecycle (owner OR SuperAdmin via canEditCourse):
 *   POST   /api/courses                — create draft (author-eligibility gated)
 *   GET    /api/courses/me             — list my courses
 *   GET    /api/courses/:id            — editor fetch (any status)
 *   PATCH  /api/courses/:id            — update fields
 *   POST   /api/courses/:id/publish    — flip to published
 *   POST   /api/courses/:id/unpublish  — back to draft
 *   DELETE /api/courses/:id            — hard delete (cascades)
 *   POST   /api/courses/:id/clone      — deep clone (modules + lessons)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import {
  cloneCourse,
  createCourse,
  deleteCourse,
  getCourseForEditor,
  listMyCourses,
  publishCourse,
  unpublishCourse,
  updateCourse,
} from "../../services/courses/courseAuthoringService.js";
import { withGamification } from "../../domains/gamification/with-gamification.js";
import { CreateCourseSchema, UpdateCourseSchema } from "./schemas.js";
import { courseActor, handle, readBody, respond, unauthorized, validationError } from "./shared.js";

export const courseCrudRoutes = new Hono<AppEnv>();

courseCrudRoutes.post("/", async (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  const parsed = CreateCourseSchema.safeParse(await readBody(c));
  if (!parsed.success) return validationError(c, parsed.error);
  return respond(c, () => createCourse(actor, parsed.data), 201);
});

// Static `/me` before `/:id`.
courseCrudRoutes.get("/me", (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  return respond(c, () => listMyCourses(actor.userId));
});

courseCrudRoutes.get("/:id", (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  return respond(c, () => getCourseForEditor(actor, c.req.param("id")));
});

courseCrudRoutes.patch("/:id", async (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  const parsed = UpdateCourseSchema.safeParse(await readBody(c));
  if (!parsed.success) return validationError(c, parsed.error);
  return respond(c, () => updateCourse(actor, c.req.param("id"), parsed.data));
});

courseCrudRoutes.post("/:id/publish", (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  return handle(c, async () => {
    const { course, previous, firstPublish } = await publishCourse(actor, c.req.param("id"));
    // Only the never-published → published edge earns COURSE_PUBLISHED.
    if (firstPublish) {
      await withGamification(c, "course-published", (game, role, uid2) =>
        game.onCoursePublished({
          userId: uid2,
          role,
          courseId: previous.id,
          metadata: { title: previous.title, isEmployerAuthored: previous.isEmployerAuthored },
        }),
      );
    }
    return c.json(success(course), 200);
  });
});

courseCrudRoutes.post("/:id/unpublish", (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  return respond(c, () => unpublishCourse(actor, c.req.param("id")));
});

courseCrudRoutes.delete("/:id", (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  return respond(c, async () => ({ deleted: await deleteCourse(actor, c.req.param("id")) }));
});

courseCrudRoutes.post("/:id/clone", (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  return respond(c, () => cloneCourse(actor, c.req.param("id")), 201);
});
