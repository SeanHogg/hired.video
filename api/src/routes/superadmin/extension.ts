/**
 * SuperAdmin extension-telemetry viewer (read-only). Mounted at
 * /api/admin/sa/extension on the SA console; the SA guard is applied once by
 * the admin composite (routes/admin/index.ts).
 *
 *   GET /sessions      — paginated session list with rollup counters
 *   GET /sessions/:id  — single session timeline (all events)
 *   GET /captures      — picker captures by host/extension; each row is a
 *                        candidate rule for siteConfigs.ts
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { ExtensionTelemetryRepository } from "../../repositories/admin/extensionTelemetryRepository.js";

export const extensionTelemetryRoutes = new Hono<AppEnv>();

const SessionListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  extension: z.enum(["jobseeker", "recruiter"]).optional(),
  hasErrors: z.coerce.boolean().optional(),
  hasCaptures: z.coerce.boolean().optional(),
});

const CaptureListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  host: z.string().max(255).optional(),
  extension: z.enum(["jobseeker", "recruiter"]).optional(),
});

extensionTelemetryRoutes.get("/sessions", async (c) => {
  const parsed = SessionListQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  const { page, limit } = parsed.data;
  const { sessions, total } = await ExtensionTelemetryRepository.create().listSessions(parsed.data);
  return c.json(success({ sessions, page, limit, total }), 200);
});

extensionTelemetryRoutes.get("/sessions/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json(error("VALIDATION_ERROR", "Invalid session id"), 400);
  const timeline = await ExtensionTelemetryRepository.create().findSessionTimeline(id);
  if (!timeline) return c.json(error("NOT_FOUND", "Session not found"), 404);
  return c.json(success(timeline), 200);
});

extensionTelemetryRoutes.get("/captures", async (c) => {
  const parsed = CaptureListQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  const { page, limit } = parsed.data;
  const { captures, total, byHost } = await ExtensionTelemetryRepository.create().listCaptures(parsed.data);
  return c.json(success({ captures, page, limit, total, byHost }), 200);
});
