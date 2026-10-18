/**
 * SuperAdmin dashboard-feed curation. Mounted at /api/admin/feed-features
 * by the admin composite (routes/admin/index.ts), which applies the SA guard.
 *
 * Lets a SuperAdmin pin any card (tool, page, article, video, job, …) to
 * the dashboard of one or more roles, reorder, toggle, and remove. Every
 * mutation is audit-logged and invalidates the per-role read cache (handled
 * inside FeedFeatureService).
 *
 * Routes:
 *   GET    /api/admin/feed-features        — list all (active + inactive)
 *   POST   /api/admin/feed-features        — create/upsert a feature
 *   PATCH  /api/admin/feed-features/:id    — update roles/rank/active/payload
 *   DELETE /api/admin/feed-features/:id    — remove a feature
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { adminRepos } from "../repositories/admin/index.js";
import { recordAdminAudit } from "../services/admin/adminAudit.js";
import { FeedFeatureService } from "../services/feed/FeedFeatureService.js";
import {
  CreateFeedFeatureSchema,
  UpdateFeedFeatureSchema,
} from "../../../shared/feed-features.js";
import { validateJson } from "./helpers/validate.js";

export const adminFeedFeatureRoutes = new Hono<AppEnv>();

function buildService() {
  return new FeedFeatureService(adminRepos().feedFeatures);
}

function audit(actorId: string, action: string, targetId: string, metadata: Record<string, unknown>) {
  return recordAdminAudit({ actorId, action, targetType: "feed_feature", targetId, metadata });
}

// ---------------------------------------------------------------------------
// GET / — full curation list
// ---------------------------------------------------------------------------
adminFeedFeatureRoutes.get("/", async (c) => {
  const items = await buildService().listForAdmin();
  return c.json(success(items), 200);
});

// ---------------------------------------------------------------------------
// POST / — create or upsert (entity_kind + entity_id is unique)
// ---------------------------------------------------------------------------
adminFeedFeatureRoutes.post("/", validateJson(CreateFeedFeatureSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  const actorId = c.var.userId;
  const created = await buildService().create({
    ...body,
    createdBy: actorId,
  });
  await audit(actorId, "feed_features.create", created.id, {
    entityKind: created.entityKind,
    entityId: created.entityId,
    roles: created.roles,
  });
  return c.json(success(created), 201);
});

// ---------------------------------------------------------------------------
// PATCH /:id — update roles / rank / active / payload
// ---------------------------------------------------------------------------
adminFeedFeatureRoutes.patch("/:id", validateJson(UpdateFeedFeatureSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const updated = await buildService().update(id, body);
  if (!updated) {
    return c.json(error("NOT_FOUND", "Feed feature not found"), 404);
  }
  const actorId = c.var.userId;
  await audit(actorId, "feed_features.update", id, { patch: body });
  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------
adminFeedFeatureRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await buildService().remove(id);
  if (!ok) {
    return c.json(error("NOT_FOUND", "Feed feature not found"), 404);
  }
  const actorId = c.var.userId;
  await audit(actorId, "feed_features.delete", id, {});
  return c.json(success({ id, deleted: true }), 200);
});

export default adminFeedFeatureRoutes;
