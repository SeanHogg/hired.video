/**
 * Learner enrolment, progress, prerequisites and certificates:
 *   GET    /api/courses/me/enrollments                        — my enrolments (+ lesson totals)
 *   GET    /api/courses/enrollments/:enrollmentId/content     — learner full content fetch
 *   POST   /api/courses/:id/enroll                            — enrol (free courses only)
 *   DELETE /api/courses/:id/enroll                            — unenrol (blocked once cert issued)
 *   PATCH  /api/courses/enrollments/:enrollmentId/progress    — lesson progress + completion fan-out
 *   GET    /api/courses/:id/prerequisites                     — direct prereqs
 *   POST   /api/courses/:id/prerequisites                     — add DAG edge (cycle-safe)
 *   DELETE /api/courses/:id/prerequisites/:prereqId
 *   POST   /api/courses/enrollments/:enrollmentId/certificate — issue cert
 *   GET    /api/courses/me/certificates                       — my certs
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { withGamification } from "../../domains/gamification/with-gamification.js";
import {
  addCoursePrerequisite,
  enrollInCourse,
  getEnrollmentContent,
  issueEnrollmentCertificate,
  listCoursePrerequisites,
  listMyCertificates,
  listMyEnrollments,
  removeCoursePrerequisite,
  unenrollFromCourse,
} from "../../services/courses/courseEnrollmentService.js";
import { updateLessonProgress } from "../../services/courses/courseProgressService.js";
import { PrerequisiteSchema, ProgressUpdateSchema } from "./schemas.js";
import {
  courseActor,
  invalidBody,
  learnerGamification,
  respond,
  unauthorized,
} from "./shared.js";
import { validateJson } from "../helpers/validate.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const courseEnrollmentRoutes = new Hono<AppEnv>();

courseEnrollmentRoutes.get("/me/enrollments", (c) => {
  const userId = requireUser(c);
  return respond(c, () => listMyEnrollments(userId));
});

// Gated on owning the enrolment — never leaks content by enrolment id.
courseEnrollmentRoutes.get("/enrollments/:enrollmentId/content", (c) => {
  const userId = requireUser(c);
  return respond(c, () => getEnrollmentContent(userId, c.req.param("enrollmentId")));
});

courseEnrollmentRoutes.post("/:id/enroll", async (c) => {
  const userId = requireUser(c);
  const { enrollment, created } = await enrollInCourse(userId, c.req.param("id"));
  return c.json(success(enrollment), created ? 201 : 200);
});

courseEnrollmentRoutes.delete("/:id/enroll", (c) => {
  const userId = requireUser(c);
  return respond(c, async () => {
    await unenrollFromCourse(userId, c.req.param("id"));
    return { unenrolled: true };
  });
});

courseEnrollmentRoutes.patch("/enrollments/:enrollmentId/progress", validateJson(ProgressUpdateSchema, invalidBody), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, () =>
    updateLessonProgress(userId, c.req.param("enrollmentId"), body, learnerGamification(c)),
  );
});

// ---------------------------------------------------------------------------
// Prerequisites (DAG edges)
// ---------------------------------------------------------------------------

courseEnrollmentRoutes.get("/:id/prerequisites", (c) =>
  respond(c, () => listCoursePrerequisites(c.req.param("id"))),
);

courseEnrollmentRoutes.post("/:id/prerequisites", validateJson(PrerequisiteSchema, invalidBody), async (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  const body = c.req.valid("json");
  const result = await addCoursePrerequisite(actor, c.req.param("id"), body.prerequisiteCourseId);
  return c.json(success(result), result.created ? 201 : 200);
});

courseEnrollmentRoutes.delete("/:id/prerequisites/:prereqId", (c) => {
  const actor = courseActor(c);
  if (!actor) return unauthorized(c);
  return respond(c, () => removeCoursePrerequisite(actor, c.req.param("id"), c.req.param("prereqId")));
});

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

courseEnrollmentRoutes.post("/enrollments/:enrollmentId/certificate", async (c) => {
  const userId = requireUser(c);
  const result = await issueEnrollmentCertificate(userId, c.req.param("enrollmentId"));
  if (result.newlyIssued) {
    await withGamification(c, "certificate-earned", (game, role, uid2) =>
      game.onCertificateEarned({
        userId: uid2,
        role,
        certificateId: result.certificate.id,
        metadata: { certNumber: result.certificate.certNumber },
      }),
    );
  }
  return c.json(success(result.certificate), result.newlyIssued ? 201 : 200);
});

courseEnrollmentRoutes.get("/me/certificates", (c) => {
  const userId = requireUser(c);
  return respond(c, () => listMyCertificates(userId));
});
