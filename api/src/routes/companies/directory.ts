/**
 * /api/companies read-side listings: public directory, trending, followed,
 * owned-by, slug lookup, a company's jobs and stats. All static paths here
 * must be mounted before the profile router's GET /:id.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { COMPANY_LIST_FIELDS, parseFields, projectRows } from "../../../../shared/projection.js";
import { parsePagination } from "../../utils/pagination.js";
import { withCacheHeaders } from "../../utils/cache-headers.js";
import { toHandlerResult } from "../../handlers/shared.js";
import { requireUser, sendHandlerResult } from "../helpers/routerHelpers.js";
import {
  getCompanyMetaBySlug,
  getCompanyStats,
  listCompanyJobs,
  listFollowedCompanyMetas,
  listOwnedCompanyMetas,
  listPublicCompanyMetas,
  listTrendingCompanyMetas,
} from "../../services/company/companyDirectory.js";
import { envRecord } from "./shared.js";

export const companyDirectoryRoutes = new Hono<AppEnv>();

companyDirectoryRoutes.get("/public", async (c) => {
  const { page, limit } = parsePagination(c, { defaultLimit: 10, maxLimit: 100 });
  const search = c.req.query("search")?.trim();
  // Structured geo filter (#1178) — mirrors the unified-search pattern.
  const geo = {
    countryId: c.req.query("countryId") ? Number(c.req.query("countryId")) : undefined,
    stateId: c.req.query("stateId") || undefined,
    cityId: c.req.query("cityId") || undefined,
    remote: c.req.query("isRemote") === "true" ? true : undefined,
    text: c.req.query("location") || undefined,
  };
  const { metas, total } = await listPublicCompanyMetas({ page, limit, search, geo }, envRecord(c));

  const totalPages = Math.ceil(total / limit);
  // CDN-cacheable: anonymous + no side effects. 60s browser / 5min edge
  // means a new company shows up in the public list within a few minutes.
  withCacheHeaders(c, { scope: "public", maxAge: 60, sMaxAge: 300, swr: 600 });
  // `?fields=` projection (gap #1370) — strips description / culture / values
  // / mission JSONB blobs when the caller only needs the card-view fields.
  const fields = parseFields(c.req.query("fields"), COMPANY_LIST_FIELDS);
  const items = projectRows(metas as Array<Record<string, unknown>>, fields);
  return c.json(success({ items, total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 }), 200);
});

// Trending companies (most followers)
companyDirectoryRoutes.get("/trending", async (c) => {
  return c.json(success(await listTrendingCompanyMetas()), 200);
});

// Companies the current user follows
companyDirectoryRoutes.get("/me/followed", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await listFollowedCompanyMetas(auth.userId)), 200);
});

// Look up by slug
companyDirectoryRoutes.get("/slug/:slug", async (c) => {
  return sendHandlerResult(c, await toHandlerResult(getCompanyMetaBySlug(c.req.param("slug"))));
});

// Jobs at a company (newest active, bounded + cached)
companyDirectoryRoutes.get("/:id/jobs", async (c) => {
  return sendHandlerResult(c, await toHandlerResult(listCompanyJobs(c.req.param("id"))));
});

// Company stats
companyDirectoryRoutes.get("/:id/stats", async (c) => {
  return sendHandlerResult(c, await toHandlerResult(getCompanyStats(c.req.param("id"))));
});

// Companies owned by the caller / by a given user (public). Drives the
// Company tab on the People profile.
companyDirectoryRoutes.get("/me", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return c.json(success(await listOwnedCompanyMetas(auth.userId)), 200);
});

companyDirectoryRoutes.get("/by-user/:userId", async (c) => {
  return c.json(success(await listOwnedCompanyMetas(c.req.param("userId"))), 200);
});
