// Workspace taxonomy endpoints (Tags / Job Types / Sources — gaps
// #231, #232, #238). One router covers all three because they share
// the same read+write shape and admin pages render them as a single
// settings surface.
//
// All endpoints require an authenticated user. Workspace scoping is
// inferred from the user's active workspace context downstream; for v1
// the workspace_id column on the rows is left null and reads return
// every row (single-tenant-per-user model). Multi-tenant scoping ships
// in the workspace-aware follow-up.

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  TAG_AXES,
  type TagAxis,
  listJobTypes,
  listSources,
  listTags,
} from "../services/taxonomy/taxonomy-read-service.js";
import {
  assignTag,
  createTag,
  deleteTaxonomyRow,
  unassignTag,
} from "../services/taxonomy/taxonomy-write-service.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const taxonomyRoutes = new Hono<AppEnv>();

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// ── Tags ──────────────────────────────────────────────────────────────
const CreateTagSchema = z.object({
  axis: z.enum(TAG_AXES),
  name: z.string().trim().min(1).max(64),
  colorHex: z.string().regex(HEX_COLOR).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

taxonomyRoutes.get("/tags", async (c) => {
  requireUser(c);
  const axisParam = c.req.query("axis");
  const axis = TAG_AXES.includes(axisParam as TagAxis) ? (axisParam as TagAxis) : null;
  return c.json(success({ tags: await listTags(axis) }), 200);
});

taxonomyRoutes.post("/tags", validateJson(CreateTagSchema, (e) => error("VALIDATION_ERROR", "Invalid tag", e.flatten()), { emptyBody: null }), async (c) => {
  requireUser(c);
  const row = await createTag(c.req.valid("json"));
  return c.json(success({ tag: row }), 201);
});

// Assign / unassign tag → entity.
const AssignSchema = z.object({
  tagId: UuidLikeSchema,
  axis: z.enum(TAG_AXES),
  entityId: UuidLikeSchema,
});

taxonomyRoutes.post("/tags/assign", validateJson(AssignSchema, (e) => error("VALIDATION_ERROR", "Invalid assignment", e.flatten()), { emptyBody: null }), async (c) => {
  requireUser(c);
  await assignTag(c.req.valid("json"));
  return c.json(success({}), 200);
});

taxonomyRoutes.post("/tags/unassign", validateJson(AssignSchema, (e) => error("VALIDATION_ERROR", "Invalid assignment", e.flatten()), { emptyBody: null }), async (c) => {
  requireUser(c);
  await unassignTag(c.req.valid("json"));
  return c.json(success({}), 200);
});

// ── Job Types ─────────────────────────────────────────────────────────
taxonomyRoutes.get("/job-types", async (c) => {
  requireUser(c);
  return c.json(success({ jobTypes: await listJobTypes() }), 200);
});

// ── Deletes (#237: built-in rows 409 BUILT_IN_LOCKED — see deleteTaxonomyRow)
taxonomyRoutes.delete("/tags/:id", async (c) => {
  requireUser(c);
  await deleteTaxonomyRow("tags", c.req.param("id"));
  return c.json(success({}), 200);
});

taxonomyRoutes.delete("/job-types/:id", async (c) => {
  requireUser(c);
  await deleteTaxonomyRow("job-types", c.req.param("id"));
  return c.json(success({}), 200);
});

taxonomyRoutes.delete("/sources/:id", async (c) => {
  requireUser(c);
  await deleteTaxonomyRow("sources", c.req.param("id"));
  return c.json(success({}), 200);
});

// ── Sources ───────────────────────────────────────────────────────────
taxonomyRoutes.get("/sources", async (c) => {
  requireUser(c);
  return c.json(success({ sources: await listSources() }), 200);
});

