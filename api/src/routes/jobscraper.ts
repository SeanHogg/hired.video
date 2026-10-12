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
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { scrapeJobSource } from "../services/job/scraper.js";

export const jobScraperAdminRoutes = new Hono<AppEnv>();
export const jobScraperUserRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireAdmin(userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return ["admin", "super_admin"].includes(row?.role ?? "");
}

const SourceSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  type: z.enum(["rss", "json_api", "html"]).default("rss"),
  apiKey: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  schedule: z.string().optional(),
  isActive: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Admin: GET /api/admin/job-sources
// ---------------------------------------------------------------------------
jobScraperAdminRoutes.get("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!await requireAdmin(userId)) return c.json(error("FORBIDDEN", "Admin only"), 403);

  const db = getDb();
  const sources = await db
    .select()
    .from(schema.jobBoardSources)
    .orderBy(desc(schema.jobBoardSources.createdAt));

  return c.json(success(sources), 200);
});

// ---------------------------------------------------------------------------
// Admin: POST /api/admin/job-sources
// ---------------------------------------------------------------------------
jobScraperAdminRoutes.post("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!await requireAdmin(userId)) return c.json(error("FORBIDDEN", "Admin only"), 403);

  const body = await c.req.json().catch(() => null);
  const parsed = SourceSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();
  const [source] = await db
    .insert(schema.jobBoardSources)
    .values({
      ...parsed.data,
      config: parsed.data.config ?? {},
      createdByUserId: userId,
      scope: "global",
    } as any)
    .returning();

  return c.json(success(source), 201);
});

// ---------------------------------------------------------------------------
// Admin: PATCH /api/admin/job-sources/:id
// ---------------------------------------------------------------------------
jobScraperAdminRoutes.patch("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!await requireAdmin(userId)) return c.json(error("FORBIDDEN", "Admin only"), 403);

  const db = getDb();
  const body = await c.req.json().catch(() => ({}));

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.url === "string") updates.url = body.url;
  if (typeof body.type === "string") updates.type = body.type;
  if (typeof body.apiKey === "string") updates.apiKey = body.apiKey;
  if (body.config && typeof body.config === "object") updates.config = body.config;
  if (typeof body.schedule === "string") updates.schedule = body.schedule;
  if (typeof body.isActive === "boolean") updates.isActive = body.isActive;

  const [updated] = await db
    .update(schema.jobBoardSources)
    .set(updates as any)
    .where(eq(schema.jobBoardSources.id, c.req.param("id")))
    .returning();

  if (!updated) return c.json(error("NOT_FOUND", "Source not found"), 404);
  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// Admin: DELETE /api/admin/job-sources/:id
// ---------------------------------------------------------------------------
jobScraperAdminRoutes.delete("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!await requireAdmin(userId)) return c.json(error("FORBIDDEN", "Admin only"), 403);

  const db = getDb();
  await db.delete(schema.jobBoardSources).where(eq(schema.jobBoardSources.id, c.req.param("id")));
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// Admin: POST /api/admin/job-sources/:id/sync — manual trigger
// ---------------------------------------------------------------------------
jobScraperAdminRoutes.post("/:id/sync", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!await requireAdmin(userId)) return c.json(error("FORBIDDEN", "Admin only"), 403);

  const db = getDb();
  const [source] = await db
    .select()
    .from(schema.jobBoardSources)
    .where(eq(schema.jobBoardSources.id, c.req.param("id")))
    .limit(1);

  if (!source) return c.json(error("NOT_FOUND", "Source not found"), 404);

  // Import and run the scraper for this single source
  c.executionCtx.waitUntil(scrapeJobSource(source));

  return c.json(success({ queued: true, sourceId: source.id }), 202);
});

// ---------------------------------------------------------------------------
// Admin: GET /api/admin/job-sources/:id/logs — sync history
// ---------------------------------------------------------------------------
jobScraperAdminRoutes.get("/:id/logs", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!await requireAdmin(userId)) return c.json(error("FORBIDDEN", "Admin only"), 403);

  const db = getDb();
  const logs = await db
    .select()
    .from(schema.jobBoardSyncLog)
    .where(eq(schema.jobBoardSyncLog.sourceId, c.req.param("id")))
    .orderBy(desc(schema.jobBoardSyncLog.startedAt))
    .limit(50);

  return c.json(success(logs), 200);
});

// ---------------------------------------------------------------------------
// User (company/recruiter): GET /api/job-sources — my sources
// ---------------------------------------------------------------------------
jobScraperUserRoutes.get("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const sources = await db
    .select()
    .from(schema.jobBoardSources)
    .where(eq(schema.jobBoardSources.createdByUserId, userId))
    .orderBy(desc(schema.jobBoardSources.createdAt));

  return c.json(success(sources), 200);
});

// ---------------------------------------------------------------------------
// User: POST /api/job-sources — add a custom source
// ---------------------------------------------------------------------------
jobScraperUserRoutes.post("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = SourceSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();

  // Limit: max 10 custom sources per user
  const [countRow] = await db
    .select({ n: count() })
    .from(schema.jobBoardSources)
    .where(eq(schema.jobBoardSources.createdByUserId, userId));

  if (Number(countRow?.n ?? 0) >= 10) {
    return c.json(error("LIMIT_EXCEEDED", "Maximum of 10 custom job sources per user"), 429);
  }

  const [source] = await db
    .insert(schema.jobBoardSources)
    .values({
      ...parsed.data,
      config: parsed.data.config ?? {},
      createdByUserId: userId,
      scope: "recruiter",
    } as any)
    .returning();

  return c.json(success(source), 201);
});

// ---------------------------------------------------------------------------
// User: PATCH /api/job-sources/:id — update own source
// ---------------------------------------------------------------------------
jobScraperUserRoutes.patch("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const body = await c.req.json().catch(() => ({}));

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.url === "string") updates.url = body.url;
  if (typeof body.apiKey === "string") updates.apiKey = body.apiKey;
  if (body.config && typeof body.config === "object") updates.config = body.config;
  if (typeof body.isActive === "boolean") updates.isActive = body.isActive;

  const [updated] = await db
    .update(schema.jobBoardSources)
    .set(updates as any)
    .where(and(
      eq(schema.jobBoardSources.id, c.req.param("id")),
      eq(schema.jobBoardSources.createdByUserId, userId),
    ))
    .returning();

  if (!updated) return c.json(error("NOT_FOUND", "Source not found"), 404);
  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// User: DELETE /api/job-sources/:id — remove own source
// ---------------------------------------------------------------------------
jobScraperUserRoutes.delete("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  await db
    .delete(schema.jobBoardSources)
    .where(and(
      eq(schema.jobBoardSources.id, c.req.param("id")),
      eq(schema.jobBoardSources.createdByUserId, userId),
    ));

  return c.json(success({ deleted: true }), 200);
});
