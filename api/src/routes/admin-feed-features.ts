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
adminFeedFeatureRoutes.post("/", async (c) => {
  const parsed = CreateFeedFeatureSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const actorId = c.var.user?.sub as string;
  const created = await buildService().create({
    ...parsed.data,
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
adminFeedFeatureRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = UpdateFeedFeatureSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const updated = await buildService().update(id, parsed.data);
  if (!updated) {
    return c.json(error("NOT_FOUND", "Feed feature not found"), 404);
  }
  const actorId = c.var.user?.sub as string;
  await audit(actorId, "feed_features.update", id, { patch: parsed.data });
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
  const actorId = c.var.user?.sub as string;
  await audit(actorId, "feed_features.delete", id, {});
  return c.json(success({ id, deleted: true }), 200);
});

export default adminFeedFeatureRoutes;
