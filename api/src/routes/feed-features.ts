/**
 * Dashboard feed (read) — the SuperAdmin-curated cards a viewer sees on
 * their otherwise-empty dashboard. Mounted at /api/feed-features.
 *
 * Authenticated: the role comes from the viewer's JWT so each role gets its
 * own curated set. A SuperAdmin may pass ?role=<role> to preview another
 * role's feed (used by the curation page); non-SA callers always get their
 * own role regardless of the query param.
 *
 * Read-through cached per role in FeedFeatureService.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { liveRepos } from "../repositories/live.js";
import { FeedFeatureService } from "../services/feed/FeedFeatureService.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { resolveFeedRole, FEED_FEATURE_ROLES } from "../../../shared/feed-features.js";

export const feedFeatureRoutes = new Hono<AppEnv>();

feedFeatureRoutes.get("/", async (c) => {
  const viewerRole = resolveFeedRole(c.var.user?.roles);

  // SA-only role preview — lets the curation page render exactly what each
  // role's dashboard will show without impersonating.
  const requested = c.req.query("role");
  const role =
    requested &&
    isSuperAdmin(c.var.user) &&
    (FEED_FEATURE_ROLES as readonly string[]).includes(requested)
      ? requested
      : viewerRole;

  const service = new FeedFeatureService(liveRepos().feedFeatures);
  const cards = await service.getCardsForRole(role);
  return c.json(success({ role, cards }), 200);
});

export default feedFeatureRoutes;
