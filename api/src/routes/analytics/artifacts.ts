/**
 * Artifact analytics reads.
 *
 *   GET /api/analytics/artifacts/:kind/:id[?view=engagement|traffic|rollup]
 *     engagement (default) — artifact_views rollup (totalViews, heatmap,
 *       geo, referrers, viewers, ctaClicks). Owner-or-super-admin.
 *     traffic — job/company listing view events (kind = job | company);
 *       gated by requireJobOwner / requireCompanyOwner.
 *     rollup  — per-job views/applications/pipeline funnel (kind = job);
 *       gated by requireJobOwner.
 *
 *   GET /api/analytics/creator/me — cross-artifact rollup for the unified
 *     creator dashboard (#1019 L5).
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { isSuperAdmin } from "../../middleware/superAdmin.js";
import { getArtifactMetrics, lookupArtifactOwner } from "../../services/analytics/artifactAnalytics.js";
import {
  getCompanyTraffic,
  getJobRollup,
  getJobTraffic,
  parseArtifactAnalyticsView,
} from "../../services/analytics/listingAnalytics.js";
import { requireJobOwner } from "../../services/jobs/jobOwnership.js";
import { requireCompanyOwner } from "../../services/company/companyOwnership.js";
import { isArtifactKind } from "../../../../shared/artifact-views.js";

export const analyticsArtifactRoutes = new Hono<AppEnv>();

analyticsArtifactRoutes.get("/artifacts/:kind/:id", async (c) => {
  const kindParam = c.req.param("kind");
  if (!isArtifactKind(kindParam)) {
    return c.json(error("INVALID_KIND", "Unknown artifact kind"), 400);
  }
  const kind = kindParam;
  const id = c.req.param("id");
  const view = parseArtifactAnalyticsView(c.req.query("view"));
  if (!view) return c.json(error("INVALID_VIEW", "Unknown analytics view"), 400);

  if (view === "traffic") {
    if (kind === "job") {
      const { denied } = await requireJobOwner(c, id);
      if (denied) return denied;
      return c.json(success(await getJobTraffic(id)), 200);
    }
    if (kind === "company") {
      const { denied, access } = await requireCompanyOwner(c, id);
      if (denied) return denied;
      return c.json(success(await getCompanyTraffic(access!.companyId)), 200);
    }
    return c.json(error("INVALID_VIEW", "traffic is only available for job and company"), 400);
  }

  if (view === "rollup") {
    if (kind !== "job") return c.json(error("INVALID_VIEW", "rollup is only available for job"), 400);
    const { denied } = await requireJobOwner(c, id);
    if (denied) return denied;
    return c.json(success(await getJobRollup(id)), 200);
  }

  const uid = c.var.user?.sub ?? null;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const ownerUserId = await lookupArtifactOwner(kind, id);
  // Owner-or-super-admin via the canonical predicate (the JWT carries
  // `roles[]` + `isSuperAdmin`, never a singular `role`).
  if (!isSuperAdmin(c.var.user) && ownerUserId !== uid) {
    return c.json(error("FORBIDDEN", "Only the artifact owner can read stats"), 403);
  }
  return c.json(success(await getArtifactMetrics(kind, id)), 200);
});

analyticsArtifactRoutes.get("/creator/me", async (c) => {
  const uid = c.var.user?.sub ?? null;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const { buildCreatorRollup } = await import("../../services/analytics/creatorRollup.js");
  return c.json(success(await buildCreatorRollup(uid)), 200);
});
