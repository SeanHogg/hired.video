/** /api/companies/:id/follow + /:id/following-status — follow graph. */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  handleFollowCompany,
  handleFollowingStatus,
  handleUnfollowCompany,
} from "../../services/company/handlers.js";
import { companyDeps, findCompany } from "../../services/company/companyDirectory.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { viewerId } from "./shared.js";

export const companyFollowRoutes = new Hono<AppEnv>();

// Follow a company
companyFollowRoutes.post("/:id/follow", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const company = await findCompany(c.req.param("id"));
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  return c.json(success(await handleFollowCompany(companyDeps(), auth.userId, company.id)), 200);
});

// Unfollow a company
companyFollowRoutes.delete("/:id/follow", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const company = await findCompany(c.req.param("id"));
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  return c.json(success(await handleUnfollowCompany(companyDeps(), auth.userId, company.id)), 200);
});

// Is the current user following this company? Anonymous / unknown → false.
companyFollowRoutes.get("/:id/following-status", async (c) => {
  const uid = viewerId(c);
  if (!uid) return c.json(success({ isFollowing: false }), 200);
  const company = await findCompany(c.req.param("id"));
  if (!company) return c.json(success({ isFollowing: false }), 200);
  return c.json(success(await handleFollowingStatus(companyDeps(), uid, company.id)), 200);
});
