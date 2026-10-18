/**
 * SCORM same-origin asset proxy (#1460):
 *   GET /api/courses/scorm-asset/:userId/:pkgId/*
 *
 * Streams `uploads/<userId>/scorm/<pkgId>/<path>` from R2 over the app's
 * own origin so the SCO iframe can reach `window.parent.API` /
 * `API_1484_11` (fails silently cross-origin). Public (no auth) — the
 * iframe runs without our JWT; whitelisted by app.ts
 * `COURSES_SCORM_ASSET_ROUTE`. Path validation rejects traversal.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { error } from "../../types/index.js";
import { fetchScormAsset } from "../../services/courses/scormRuntimeService.js";

export const courseScormAssetRoutes = new Hono<AppEnv>();

courseScormAssetRoutes.get("/scorm-asset/:userId/:pkgId/*", async (c) => {
  const userId = c.req.param("userId");
  const pkgId = c.req.param("pkgId");
  // The `*` tail is read off the full request path.
  const prefix = `/api/courses/scorm-asset/${userId}/${pkgId}/`;
  if (!c.req.path.startsWith(prefix)) {
    return c.json(error("VALIDATION_ERROR", "Malformed scorm-asset URL"), 400);
  }
  const relPath = c.req.path.slice(prefix.length);
  const asset = await fetchScormAsset(userId, pkgId, relPath);
  return new Response(asset.body, {
    status: 200,
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
