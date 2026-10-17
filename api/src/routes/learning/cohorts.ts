/**
 * Cohorts / classrooms (#1887) + assignments (#1888) + progress
 * analytics (#1890) — the educator↔student group layer, under
 * /api/learning/cohorts.
 *
 * Educator = creator-program enrollee OR employer (the #1886 decision —
 * NOT a new role). Cohort creation is gated on the shared author-eligibility
 * seam; every per-cohort mutation/read routes through CohortService, which
 * enforces canActFor ownership.
 *
 *   Educator
 *     POST   /cohorts                          — create
 *     GET    /cohorts/me                       — cohorts I manage
 *     GET    /cohorts/:id                      — cohort + members
 *     PATCH  /cohorts/:id                      — rename / archive / rotate code
 *     GET    /cohorts/:id/members
 *     POST   /cohorts/:id/members              — add (user / email / placeholder)
 *     DELETE /cohorts/:id/members/:memberId
 *     GET    /cohorts/:id/assignments
 *     POST   /cohorts/:id/assignments          — assign course/path + due date
 *     DELETE /cohorts/:id/assignments/:assignmentId
 *     GET    /cohorts/:id/analytics            — cached progress roll-up
 *   Learner
 *     GET    /cohorts/memberships/me           — cohorts I'm in
 *     GET    /cohorts/assignments/me           — assigned to me
 *     POST   /cohorts/join                     — { joinCode }
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { CohortNotFoundError, WorkspaceForbiddenError } from "../../services/learning/cohort-service.js";
import { AssignmentSubjectNotFoundError } from "../../services/learning/assignment-service.js";
import {
  assignmentService,
  authorEligibility,
  awardEducatorAddedMember,
  cohortAnalyticsService,
  cohortService,
} from "../../services/learning/learning-surface.js";

export const cohortRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}
function roles(c: any): string[] {
  const r = c.var.user?.roles;
  return Array.isArray(r) ? (r as string[]) : [];
}

/** Map service errors to HTTP responses. Single seam so every handler
 *  reports ownership/not-found consistently. */
function mapError(c: any, e: unknown) {
  if (e instanceof CohortNotFoundError) return c.json(error("NOT_FOUND", e.message), 404);
  if (e instanceof WorkspaceForbiddenError) return c.json(error("FORBIDDEN", e.message), 403);
  if (e instanceof AssignmentSubjectNotFoundError) return c.json(error("VALIDATION_ERROR", e.message), 400);
  return c.json(error("INTERNAL_ERROR", "Something went wrong."), 500);
}

// ── Validators ──────────────────────────────────────────────────────────────

export const CreateCohortSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  companyId: UuidLikeSchema.optional(),
  withJoinCode: z.boolean().optional(),
});

export const UpdateCohortSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  rotateJoinCode: z.boolean().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const AddMemberSchema = z.object({
  userId: UuidLikeSchema.optional(),
  invitedEmail: z.string().email().max(320).optional(),
  displayName: z.string().min(1).max(200).optional(),
  role: z.enum(["student", "co_educator"]).optional(),
}).refine((d) => d.userId || d.invitedEmail || d.displayName, {
  message: "Provide a userId, invitedEmail, or displayName.",
});

export const CreateAssignmentSchema = z.object({
  subjectType: z.enum(["course", "path"]),
  subjectId: UuidLikeSchema,
  memberId: UuidLikeSchema.optional(),
  required: z.boolean().optional(),
  dueAt: z.string().datetime().optional(),
});

export const JoinSchema = z.object({ joinCode: z.string().min(4).max(16) });

async function body<T extends z.ZodTypeAny>(c: any, schema: T): Promise<z.infer<T> | null> {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  return parsed.success ? parsed.data : null;
}

// ── Learner (static paths before /cohorts/:id) ───────────────────────────────

cohortRoutes.get("/cohorts/memberships/me", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(success(await cohortService().listMyMemberships(userId)), 200);
});

cohortRoutes.get("/cohorts/assignments/me", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(success(await assignmentService().listForLearner(userId)), 200);
});

cohortRoutes.post("/cohorts/join", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const data = await body(c, JoinSchema);
  if (!data) return c.json(error("VALIDATION_ERROR", "A join code is required."), 400);
  try {
    const result = await cohortService().joinByCode(userId, data.joinCode);
    // The joining student earns once per (student, cohort). Fire-and-forget.
    const { withGamification } = await import("../../domains/gamification/with-gamification.js");
    await withGamification(c, "cohort-student-joined", (game, role, uidEarner) =>
      game.onCohortStudentJoined({
        userId: uidEarner,
        role,
        cohortId: result.cohort.id,
        memberId: result.member.id,
      }),
    );
    return c.json(success(result), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

// ── Educator ──────────────────────────────────────────────────────────────────

cohortRoutes.post("/cohorts", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const data = await body(c, CreateCohortSchema);
  if (!data) return c.json(error("VALIDATION_ERROR", "A cohort name is required."), 400);
  const eligibility = await authorEligibility(userId, roles(c));
  if (!eligibility.ok) {
    return c.json(error("AUTHORING_NOT_ELIGIBLE", "Creating a classroom requires the Courses Creator Program or an employer role."), 403);
  }
  try {
    const created = await cohortService().createCohort(userId, data);
    // The educator earns for spinning up a classroom. Fire-and-forget.
    const { withGamification } = await import("../../domains/gamification/with-gamification.js");
    await withGamification(c, "cohort-created", (game, role, uidEarner) =>
      game.onCohortCreated({ userId: uidEarner, role, cohortId: created.id }),
    );
    return c.json(success(created), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

cohortRoutes.get("/cohorts/me", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(success(await cohortService().listManageable(userId)), 200);
});

cohortRoutes.get("/cohorts/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const svc = cohortService();
  try {
    const cohort = await svc.getManageable(userId, c.req.param("id"));
    const members = await svc.listMembers(userId, cohort.id);
    return c.json(success({ cohort, members }), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

cohortRoutes.patch("/cohorts/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const data = await body(c, UpdateCohortSchema);
  if (!data) return c.json(error("VALIDATION_ERROR", "Invalid body"), 400);
  try {
    const updated = await cohortService().updateCohort(userId, c.req.param("id"), data);
    return c.json(success(updated), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

cohortRoutes.get("/cohorts/:id/members", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    return c.json(success(await cohortService().listMembers(userId, c.req.param("id"))), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

cohortRoutes.post("/cohorts/:id/members", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const data = await body(c, AddMemberSchema);
  if (!data) return c.json(error("VALIDATION_ERROR", "Provide a userId, invitedEmail, or displayName."), 400);
  try {
    const row = await cohortService().addMember(userId, c.req.param("id"), data);
    // Invited-only rows (no userId yet) earn on accept, not here.
    if (row.userId) await awardEducatorAddedMember({ id: row.id, cohortId: row.cohortId, userId: row.userId });
    return c.json(success(row), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

cohortRoutes.delete("/cohorts/:id/members/:memberId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const ok = await cohortService().removeMember(userId, c.req.param("id"), c.req.param("memberId"));
    if (!ok) return c.json(error("NOT_FOUND", "Member not found"), 404);
    return c.json(success({ removed: true }), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

cohortRoutes.get("/cohorts/:id/assignments", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    return c.json(success(await assignmentService().listAssignments(userId, c.req.param("id"))), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

cohortRoutes.post("/cohorts/:id/assignments", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const data = await body(c, CreateAssignmentSchema);
  if (!data) return c.json(error("VALIDATION_ERROR", "subjectType + subjectId are required."), 400);
  try {
    const created = await assignmentService().createAssignment(userId, c.req.param("id"), {
      subjectType: data.subjectType,
      subjectId: data.subjectId,
      memberId: data.memberId ?? null,
      required: data.required,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
    });
    return c.json(success(created), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

cohortRoutes.delete("/cohorts/:id/assignments/:assignmentId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const ok = await assignmentService().removeAssignment(userId, c.req.param("id"), c.req.param("assignmentId"));
    if (!ok) return c.json(error("NOT_FOUND", "Assignment not found"), 404);
    return c.json(success({ removed: true }), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

cohortRoutes.get("/cohorts/:id/analytics", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    // Ownership check before the (cached) roll-up.
    await cohortService().getManageable(userId, c.req.param("id"));
    return c.json(success(await cohortAnalyticsService().getAnalytics(c.req.param("id"))), 200);
  } catch (e) {
    return mapError(c, e);
  }
});
