/**
 * Interview-assignment routes — the tool surface that lets either a job
 * seeker (self-practice / hand-off to AI Coach) or a recruiter (assigning
 * to a candidate) generate skill-driven questions and optionally assign
 * them as an async interview. Mounted at /api/interview-assignments (app.ts).
 *
 * The legacy studio_async_interviews CRUD in studio-features stays as-is
 * for AsyncInterviewManager; this surface owns the assignment-vs-invite,
 * text-or-video, link-expiry and resend shape.
 *
 * Thin barrel: sub-routers under routes/interview-assignments/ call use
 * cases in services/interview/assignment-*.ts, which read/write through
 * repositories/interviewAssignmentsRepository.ts. Mounted in the original
 * registration order, except /compare is mounted ahead of the `GET /:id`
 * CRUD route so the static path wins (it was previously shadowed).
 *
 *   generate → POST /generate
 *   compare  → GET  /compare?ids=…
 *   crud     → POST /assign, POST /:id/resend, GET /mine, GET /:id,
 *              POST /:id/respond, POST /:id/submit
 *   invites  → GET  /invite/:token (PUBLIC), POST /claim/:token
 *   review   → POST /:id/responses/:rid/score, POST /:id/score-all,
 *              POST /:id/decision, GET /:id/report
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { interviewAssignmentGenerateRoutes } from "./interview-assignments/generate.js";
import { interviewAssignmentCompareRoutes } from "./interview-assignments/compare.js";
import { interviewAssignmentCrudRoutes } from "./interview-assignments/crud.js";
import { interviewAssignmentInviteRoutes } from "./interview-assignments/invites.js";
import { interviewAssignmentReviewRoutes } from "./interview-assignments/review.js";

export const interviewAssignmentRoutes = new Hono<AppEnv>();
interviewAssignmentRoutes.use("*", attachTokenBudget());

interviewAssignmentRoutes.route("/", interviewAssignmentGenerateRoutes);
interviewAssignmentRoutes.route("/", interviewAssignmentCompareRoutes);
interviewAssignmentRoutes.route("/", interviewAssignmentCrudRoutes);
interviewAssignmentRoutes.route("/", interviewAssignmentInviteRoutes);
interviewAssignmentRoutes.route("/", interviewAssignmentReviewRoutes);
