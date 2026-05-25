/**
 * SuperAdmin extension-telemetry viewer.
 *
 * Three endpoints, all read-only:
 *
 *   GET /sessions      — paginated session list with rollup counters
 *   GET /sessions/:id  — single session timeline (all events)
 *   GET /captures      — picker captures only, filtered by host/extension
 *                       — the highest-leverage view because each row is
 *                       a candidate rule for siteConfigs.ts
 *
 * superAdminMiddleware is applied at the parent (superadmin/index.ts) so
 * no further auth checks here.
 */

import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";

export const extensionTelemetryRoutes = new Hono<AppEnv>();

// ── GET /sessions ──────────────────────────────────────────────────────────
const SessionListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  extension: z.enum(["jobseeker", "recruiter"]).optional(),
  hasErrors: z.coerce.boolean().optional(),
  hasCaptures: z.coerce.boolean().optional(),
});

extensionTelemetryRoutes.get("/sessions", async (c) => {
  const parsed = SessionListQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  const { page, limit, extension, hasErrors, hasCaptures } = parsed.data;

  const conditions: SQL[] = [];
  if (extension) conditions.push(eq(schema.extensionSessions.extension, extension));
  if (hasErrors) conditions.push(sql`${schema.extensionSessions.errorCount} > 0`);
  if (hasCaptures) conditions.push(sql`${schema.extensionSessions.pickerCaptureCount} > 0`);

  const db = getDb();
  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: schema.extensionSessions.id,
      clientSessionId: schema.extensionSessions.clientSessionId,
      userId: schema.extensionSessions.userId,
      userEmail: schema.users.email,
      userName: schema.users.name,
      extension: schema.extensionSessions.extension,
      version: schema.extensionSessions.version,
      eventCount: schema.extensionSessions.eventCount,
      errorCount: schema.extensionSessions.errorCount,
      pickerCaptureCount: schema.extensionSessions.pickerCaptureCount,
      startedAt: schema.extensionSessions.startedAt,
      updatedAt: schema.extensionSessions.updatedAt,
    })
    .from(schema.extensionSessions)
    .leftJoin(schema.users, eq(schema.extensionSessions.userId, schema.users.id))
    .where(whereClause)
    .orderBy(desc(schema.extensionSessions.updatedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.extensionSessions)
    .where(whereClause);

  return c.json(success({ sessions: rows, page, limit, total }), 200);
});

// ── GET /sessions/:id ──────────────────────────────────────────────────────
extensionTelemetryRoutes.get("/sessions/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return c.json(error("VALIDATION_ERROR", "Invalid session id"), 400);
  }
  const db = getDb();

  const session = await db
    .select({
      id: schema.extensionSessions.id,
      clientSessionId: schema.extensionSessions.clientSessionId,
      userId: schema.extensionSessions.userId,
      userEmail: schema.users.email,
      userName: schema.users.name,
      extension: schema.extensionSessions.extension,
      version: schema.extensionSessions.version,
      userAgent: schema.extensionSessions.userAgent,
      ipAddress: schema.extensionSessions.ipAddress,
      eventCount: schema.extensionSessions.eventCount,
      errorCount: schema.extensionSessions.errorCount,
      pickerCaptureCount: schema.extensionSessions.pickerCaptureCount,
      startedAt: schema.extensionSessions.startedAt,
      updatedAt: schema.extensionSessions.updatedAt,
    })
    .from(schema.extensionSessions)
    .leftJoin(schema.users, eq(schema.extensionSessions.userId, schema.users.id))
    .where(eq(schema.extensionSessions.id, id))
    .limit(1);

  if (session.length === 0) {
    return c.json(error("NOT_FOUND", "Session not found"), 404);
  }

  const events = await db
    .select()
    .from(schema.extensionEvents)
    .where(eq(schema.extensionEvents.sessionId, id))
    .orderBy(schema.extensionEvents.createdAt)
    .limit(2000);

  return c.json(success({ session: session[0], events }), 200);
});

// ── GET /captures ──────────────────────────────────────────────────────────
// The flywheel view — every picker_capture event is a candidate rule
// for siteConfigs.ts. Admin distills these into a prompt for Claude
// and pastes the resulting selectors into the source.
const CaptureListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  host: z.string().max(255).optional(),
  extension: z.enum(["jobseeker", "recruiter"]).optional(),
});

extensionTelemetryRoutes.get("/captures", async (c) => {
  const parsed = CaptureListQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  const { page, limit, host, extension } = parsed.data;

  const conditions: SQL[] = [eq(schema.extensionEvents.kind, "picker_capture")];
  if (host) conditions.push(eq(schema.extensionEvents.host, host));
  if (extension) conditions.push(eq(schema.extensionSessions.extension, extension));

  const db = getDb();
  const whereClause = and(...conditions);

  const rows = await db
    .select({
      id: schema.extensionEvents.id,
      sessionId: schema.extensionEvents.sessionId,
      url: schema.extensionEvents.url,
      host: schema.extensionEvents.host,
      payload: schema.extensionEvents.payload,
      createdAt: schema.extensionEvents.createdAt,
      extension: schema.extensionSessions.extension,
      userEmail: schema.users.email,
    })
    .from(schema.extensionEvents)
    .innerJoin(
      schema.extensionSessions,
      eq(schema.extensionEvents.sessionId, schema.extensionSessions.id),
    )
    .leftJoin(schema.users, eq(schema.extensionSessions.userId, schema.users.id))
    .where(whereClause)
    .orderBy(desc(schema.extensionEvents.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.extensionEvents)
    .innerJoin(
      schema.extensionSessions,
      eq(schema.extensionEvents.sessionId, schema.extensionSessions.id),
    )
    .where(whereClause);

  // Aggregate host → count alongside the list so the admin can pick the
  // worst-detected hosts in one screen.
  const byHost = await db
    .select({
      host: schema.extensionEvents.host,
      captures: sql<number>`count(*)::int`,
    })
    .from(schema.extensionEvents)
    .where(eq(schema.extensionEvents.kind, "picker_capture"))
    .groupBy(schema.extensionEvents.host)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  return c.json(success({ captures: rows, page, limit, total, byHost }), 200);
});
