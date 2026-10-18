/**
 * /api/content-audiences — owner-scoped audience tagging for creators
 * (#1644). Distinct from the SuperAdmin batch endpoint in admin.ts: this
 * lets the OWNER of a piece of content set its own audience tags from
 * the authoring form. Ownership is enforced per request.
 *
 *   GET /api/content-audiences/:kind/:entityId  → current tags (owner only)
 *   PUT /api/content-audiences/:kind/:entityId  → replace tag set (owner only)
 *
 * Registered behind the global auth layer, so c.var.user is always set.
 * Self-taggable kinds are those with a single owner column; kinds without
 * one (job, company, user_profile, …) aren't exposed here.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  getOwnedContentAudiences,
  setOwnedContentAudiences,
} from "../services/audience/contentAudienceOwnership.js";
import { ContentAudienceSetSchema } from "../../../shared/content-audiences.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const contentAudienceRoutes = new Hono<AppEnv>();

contentAudienceRoutes.get("/:kind/:entityId", async (c) => {
  const userId = requireUser(c);
  const result = await getOwnedContentAudiences(userId, c.req.param("kind"), c.req.param("entityId"));
  return c.json(success(result), 200);
});

contentAudienceRoutes.put("/:kind/:entityId", validateJson(ContentAudienceSetSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const result = await setOwnedContentAudiences(userId, c.req.param("kind"), c.req.param("entityId"), body.audiences);
  return c.json(success(result), 200);
});
