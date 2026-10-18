/**
 * Learning paths — owner authoring (curated multi-course journeys with
 * DAG-style prerequisite chaining; migration 0126 + LearningPathService).
 *
 * Authoring eligibility: creator-program enrollees OR users with `employer`
 * in their JWT roles (employer-authored paths carry is_employer_authored and
 * stay off the public marketplace unless published).
 *
 *   POST   /paths                        — create draft
 *   GET    /paths/me                     — my paths
 *   GET    /paths/:id                    — my path + course slots
 *   PATCH  /paths/:id                    — edit fields and/or `status`
 *                                          ("published" needs ≥1 course and
 *                                          stamps publishedAt; "draft" clears it)
 *   DELETE /paths/:id
 *   POST   /paths/:id/courses            — attach course
 *   PATCH  /paths/:id/courses/:courseId  — update slot
 *   DELETE /paths/:id/courses/:courseId
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import {
  PATH_STATUSES,
  attachCourse,
  createPath,
  deletePath,
  detachCourse,
  getMyPath,
  listMyPaths,
  updateCourseSlot,
  updatePath,
  type SlotResult,
} from "../../services/learning/learning-path-use-cases.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

export const pathAuthoringRoutes = new Hono<AppEnv>();

function roles(c: any): string[] {
  const r = c.var.user?.roles;
  return Array.isArray(r) ? (r as string[]) : [];
}

// ── Validators ────────────────────────────────────────────────────────────

const CreatePathSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().max(1000).optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  issuesCertificate: z.boolean().optional(),
});

export const UpdatePathSchema = CreatePathSchema.partial().extend({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),
  status: z.enum(PATH_STATUSES).optional(),
});

export const AttachCourseSchema = z.object({
  courseId: UuidLikeSchema,
  displayOrder: z.number().int().min(0).optional(),
  isRequired: z.boolean().optional(),
});

const UpdatePathCourseSchema = z.object({
  displayOrder: z.number().int().min(0).optional(),
  isRequired: z.boolean().optional(),
});

function invalid(c: any, issues: ReadonlyArray<{ message: string }>) {
  return c.json(error("VALIDATION_ERROR", issues[0]?.message ?? "Invalid body"), 400);
}

/** Map a slot operation result onto the HTTP response. */
function slotResponse(c: any, result: SlotResult<unknown>, okStatus: 200 | 201, wrap: (v: unknown) => unknown) {
  if (result.kind === "path_not_found") return c.json(error("NOT_FOUND", "Path not found"), 404);
  if (result.kind === "slot_not_found") return c.json(error("NOT_FOUND", "Slot not found"), 404);
  if (result.kind === "conflict") return c.json(error("CONFLICT", "Course already attached to path"), 409);
  if (result.kind !== "ok") return c.json(error("INTERNAL_ERROR", "Something went wrong."), 500);
  return c.json(success(wrap(result.value)), okStatus);
}

// ── Paths ─────────────────────────────────────────────────────────────────

pathAuthoringRoutes.post("/paths", validateJson(CreatePathSchema, (e, c) => invalid(c, e.issues)), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const created = await createPath(userId, roles(c), body);
  if (!created) {
    return c.json(error(
      "AUTHORING_NOT_ELIGIBLE",
      "Authoring paths requires the Courses Creator Program or an employer role.",
    ), 403);
  }
  return c.json(success(created), 201);
});

pathAuthoringRoutes.get("/paths/me", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listMyPaths(userId)), 200);
});

pathAuthoringRoutes.get("/paths/:id", async (c) => {
  const userId = requireUser(c);
  const detail = await getMyPath(userId, c.req.param("id"));
  if (!detail) return c.json(error("NOT_FOUND", "Path not found"), 404);
  return c.json(success(detail), 200);
});

pathAuthoringRoutes.patch("/paths/:id", validateJson(UpdatePathSchema, (e, c) => invalid(c, e.issues)), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const result = await updatePath(userId, c.req.param("id"), body);
  if (result.kind === "no_courses") {
    return c.json(error("VALIDATION_ERROR", "Attach at least one course before publishing."), 400);
  }
  if (result.kind !== "updated") return c.json(error("NOT_FOUND", "Path not found"), 404);
  return c.json(success(result.path), 200);
});

pathAuthoringRoutes.delete("/paths/:id", async (c) => {
  const userId = requireUser(c);
  const deleted = await deletePath(userId, c.req.param("id"));
  if (!deleted) return c.json(error("NOT_FOUND", "Path not found"), 404);
  return c.json(success({ deleted }), 200);
});

// ── Path → courses ────────────────────────────────────────────────────────

pathAuthoringRoutes.post("/paths/:id/courses", validateJson(AttachCourseSchema, (e, c) => invalid(c, e.issues)), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const result = await attachCourse(userId, c.req.param("id"), body);
  return slotResponse(c, result, 201, (v) => v);
});

pathAuthoringRoutes.patch("/paths/:id/courses/:courseId", validateJson(UpdatePathCourseSchema, (e, c) => invalid(c, e.issues)), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const patch: { displayOrder?: number; isRequired?: boolean } = {};
  if ("displayOrder" in body) patch.displayOrder = body.displayOrder;
  if ("isRequired" in body) patch.isRequired = body.isRequired;
  if (Object.keys(patch).length === 0) {
    return c.json(error("VALIDATION_ERROR", "No fields to update"), 400);
  }
  const result = await updateCourseSlot(userId, c.req.param("id"), c.req.param("courseId"), patch);
  return slotResponse(c, result, 200, (v) => v);
});

pathAuthoringRoutes.delete("/paths/:id/courses/:courseId", async (c) => {
  const userId = requireUser(c);
  const result = await detachCourse(userId, c.req.param("id"), c.req.param("courseId"));
  return slotResponse(c, result, 200, (v) => ({ deleted: v }));
});
