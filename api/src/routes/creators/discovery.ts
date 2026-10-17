/**
 * Public creator discovery (no auth):
 *   GET /browse           — rating-sorted discovery list (?category, ?limit)
 *   GET /public/:userId   — public creator profile + portfolio + recent reviews
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { clampLimit } from "../../utils/pagination.js";
import { browseCreators, getPublicCreatorProfile } from "../../services/creators/discovery.js";
import { sendResult } from "./shared.js";

export const creatorDiscoveryRoutes = new Hono<AppEnv>();

creatorDiscoveryRoutes.get("/browse", async (c) => {
  const limit = clampLimit(c.req.query("limit"), 30, 100);
  const rows = await browseCreators({ category: c.req.query("category"), limit });
  return c.json(success(rows), 200);
});

creatorDiscoveryRoutes.get("/public/:userId", async (c) =>
  sendResult(c, await getPublicCreatorProfile(c.req.param("userId"))),
);
