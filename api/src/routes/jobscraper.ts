/**
 * Job Board Scraper — Admin + per-user configuration (#86)
 *
 * Super-admin endpoints:
 *   GET    /api/admin/job-sources          — list all sources
 *   POST   /api/admin/job-sources          — create source
 *   PATCH  /api/admin/job-sources/:id      — update source
 *   DELETE /api/admin/job-sources/:id      — delete source
 *   POST   /api/admin/job-sources/:id/sync — trigger manual sync
 *   GET    /api/admin/job-sources/:id/logs — sync history
 *
 * Company/recruiter endpoints (scope = "company" | "recruiter"):
 *   GET    /api/job-sources                — my sources
 *   POST   /api/job-sources                — add source (URL or API)
 *   PATCH  /api/job-sources/:id            — update my source
 *   DELETE /api/job-sources/:id            — remove my source
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { scrapeJobSource } from "../services/job/scraper.js";
import {
  createGlobalJobSource,
  createMyJobSource,
  deleteJobSource,
  deleteMyJobSource,
  getJobSourceOrThrow,
  listAllJobSources,
  listJobSourceSyncLogs,
  listMyJobSources,
  updateJobSource,
  updateMyJobSource,
} from "../services/job/jobBoardSources.js";
import { adminMiddleware } from "../middleware/superAdmin.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const jobScraperAdminRoutes = new Hono<AppEnv>();
export const jobScraperUserRoutes = new Hono<AppEnv>();

// Every admin job-source endpoint requires internal staff (Admin / SuperAdmin).
jobScraperAdminRoutes.use("*", adminMiddleware);

const SourceSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  type: z.enum(["rss", "json_api", "html"]).default("rss"),
  apiKey: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  schedule: z.string().optional(),
  isActive: z.boolean().default(true),
});

// Admin: GET /api/admin/job-sources
jobScraperAdminRoutes.get("/", async (c) => {
  return c.json(success(await listAllJobSources()), 200);
});

// Admin: POST /api/admin/job-sources
jobScraperAdminRoutes.post("/", validateJson(SourceSchema, undefined, { emptyBody: null }), async (c) => {
  const source = await createGlobalJobSource(c.req.valid("json"), c.var.userId);
  return c.json(success(source), 201);
});

// Admin: PATCH /api/admin/job-sources/:id
jobScraperAdminRoutes.patch("/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(success(await updateJobSource(c.req.param("id"), body)), 200);
});

// Admin: DELETE /api/admin/job-sources/:id
jobScraperAdminRoutes.delete("/:id", async (c) => {
  await deleteJobSource(c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
});

// Admin: POST /api/admin/job-sources/:id/sync — manual trigger
jobScraperAdminRoutes.post("/:id/sync", async (c) => {
  const source = await getJobSourceOrThrow(c.req.param("id"));
  c.executionCtx.waitUntil(scrapeJobSource(source));
  return c.json(success({ queued: true, sourceId: source.id }), 202);
});

// Admin: GET /api/admin/job-sources/:id/logs — sync history
jobScraperAdminRoutes.get("/:id/logs", async (c) => {
  return c.json(success(await listJobSourceSyncLogs(c.req.param("id"))), 200);
});

// User (company/recruiter): GET /api/job-sources — my sources
jobScraperUserRoutes.get("/", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listMyJobSources(userId)), 200);
});

// User: POST /api/job-sources — add a custom source (max 10 per user)
jobScraperUserRoutes.post("/", validateJson(SourceSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const source = await createMyJobSource(userId, c.req.valid("json"));
  return c.json(success(source), 201);
});

// User: PATCH /api/job-sources/:id — update own source
jobScraperUserRoutes.patch("/:id", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  return c.json(success(await updateMyJobSource(userId, c.req.param("id"), body)), 200);
});

// User: DELETE /api/job-sources/:id — remove own source
jobScraperUserRoutes.delete("/:id", async (c) => {
  const userId = requireUser(c);
  await deleteMyJobSource(userId, c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
});
