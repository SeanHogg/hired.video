/**
 * #1502 course review workflow:
 *   GET  /api/courses/review-queue              — in_review courses assigned to me (SA: all)
 *   POST /api/courses/:id/submit-for-review     — flip to in_review (+ assignee)
 *
 * Mounted BEFORE the CRUD router so the static `/review-queue` path isn't
 * shadowed by `GET /:id`.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import {
  ensureCourseEditable,
  listReviewQueue,
  submitCourseForReview,
} from "../../services/courses/courseAuthoringService.js";
import { SubmitForReviewSchema } from "./schemas.js";
import { courseActor, handle, readBody, respond, unauthorized, validationError } from "./shared.js";
import { success } from "../../types/index.js";

export const courseReviewRoutes = new Hono<AppEnv>();

courseReviewRoutes.get("/review-queue", (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  return respond(c, () => listReviewQueue(actor));
});

courseReviewRoutes.post("/:id/submit-for-review", (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  const courseId = c.req.param("id");
  return handle(c, async () => {
    // Authorise before validating the body (historical order).
    await ensureCourseEditable(actor, courseId);
    const parsed = SubmitForReviewSchema.safeParse(await readBody(c));
    if (!parsed.success) return validationError(c, parsed.error);
    return c.json(success(await submitCourseForReview(courseId, parsed.data)), 200);
  });
});
