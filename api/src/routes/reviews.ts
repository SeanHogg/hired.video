/**
 * Polymorphic reviews API — composition root (mounted at /api/reviews;
 * GET is optional-auth public, see app.ts).
 *
 * One router serves every subject type (company, promo_project, course,
 * template, …). The shape of each form is declared by the descriptor in
 * shared/reviews/subject-descriptors.ts; use cases live in
 * services/reviews/*, data access in repositories/review*Repository.ts.
 *
 * Sub-routers (mount order matters — see below):
 *   reviews/comments.ts  GET|POST /:reviewId/comments, DELETE /comments/:commentId
 *   reviews/subject.ts   GET /:subjectType/:subjectId(/aggregate|/me), POST /:subjectType/:subjectId
 *   reviews/review.ts    PUT|DELETE /:reviewId
 *
 * The comments router is mounted FIRST: `/:reviewId/comments` has the same
 * shape as `/:subjectType/:subjectId`, so registered after it the comment
 * list/create endpoints were unreachable (shadowed by the subject routes,
 * which 400'd on the unknown "subject type").
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { reviewCommentRoutes } from "./reviews/comments.js";
import { reviewSubjectRoutes } from "./reviews/subject.js";
import { reviewItemRoutes } from "./reviews/review.js";

// Re-exported for tests (routes/__tests__/reviews-course-eligibility.test.ts).
export { resolveSubject, checkEligibility, type EligibilityFailure } from "../services/reviews/reviewSubject.js";

export const reviewRoutes = new Hono<AppEnv>();

reviewRoutes.route("/", reviewCommentRoutes);
reviewRoutes.route("/", reviewSubjectRoutes);
reviewRoutes.route("/", reviewItemRoutes);

reviewRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Reviews endpoint not found" } }, 404),
);
