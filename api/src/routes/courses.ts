/**
 * Courses / SCORM / Certifications (#160 foundation) — barrel.
 *
 * Split into cohesive sub-routers under routes/courses/ (route → use case in
 * services/courses/ → repository). Mounted in the ORIGINAL registration
 * order so every static path still wins over a `:param` path with the same
 * prefix:
 *   scorm-asset (public proxy) → public (/public* before /:id)
 *   → review (/review-queue before /:id) → crud (/me before /:id)
 *   → content (modules + lessons) → enrollments (enrol / progress /
 *   prerequisites / certificates) → scorm (CMI runtime).
 *
 * xAPI statement ingest + external LRS targets live in the learning xAPI
 * module (routes/learning/xapi/, mounted at /api/learning/xapi).
 *
 * Note: course-authoring.ts is a separate router mounted at the same prefix.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { courseScormAssetRoutes } from "./courses/scorm-asset.js";
import { coursePublicRoutes } from "./courses/public.js";
import { courseReviewRoutes } from "./courses/review.js";
import { courseCrudRoutes } from "./courses/crud.js";
import { courseContentRoutes } from "./courses/content.js";
import { courseEnrollmentRoutes } from "./courses/enrollments.js";
import { courseScormRoutes } from "./courses/scorm.js";

// Request schemas pinned by routes/__tests__/courses-schemas.test.ts.
export {
  CreateLessonSchema,
  PrerequisiteSchema,
  ProgressUpdateSchema,
  ScormCommitSchema,
} from "./courses/schemas.js";

export const courseRoutes = new Hono<AppEnv>();

courseRoutes.route("/", courseScormAssetRoutes);
courseRoutes.route("/", coursePublicRoutes);
courseRoutes.route("/", courseReviewRoutes);
courseRoutes.route("/", courseCrudRoutes);
courseRoutes.route("/", courseContentRoutes);
courseRoutes.route("/", courseEnrollmentRoutes);
courseRoutes.route("/", courseScormRoutes);
