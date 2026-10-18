/**
 * External LRS targets — CRUD for the per-user xAPI forwarding config.
 * Enterprise customers configure one or more endpoints; every statement
 * written via POST /api/learning/xapi/statements is POSTed to each `active`
 * target (fire-and-forget; per-target errors are persisted on the row).
 *
 *   GET    /targets
 *   POST   /targets
 *   PATCH  /targets/:id
 *   DELETE /targets/:id
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../../../types/index.js";
import { success, error } from "../../../types/index.js";
import { createTarget, deleteTarget, listTargets, updateTarget } from "../../../services/learning/xapi-use-cases.js";
import { requireUser } from "../../helpers/routerHelpers.js";
import { validateJson } from "../../helpers/validate.js";

export const xapiTargetRoutes = new Hono<{ Variables: Variables } & AppEnv>();

const ExternalLrsTargetSchema = z.object({
  endpoint: z.string().url(),
  authMode: z.enum(["basic", "bearer", "none"]).default("none"),
  authToken: z.string().min(1).max(2000).optional(),
  customHeaders: z.record(z.string().max(64), z.string().max(1024)).optional(),
  active: z.boolean().default(true),
});

xapiTargetRoutes.get("/targets", async (c) => {
  const userId = requireUser(c);
  return c.json(success({ targets: await listTargets(userId) }), 200);
});

xapiTargetRoutes.post("/targets", validateJson(ExternalLrsTargetSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return c.json(success(await createTarget(userId, body)), 201);
});

xapiTargetRoutes.patch("/targets/:id", validateJson(ExternalLrsTargetSchema.partial(), (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const updated = await updateTarget(userId, c.req.param("id"), body);
  if (!updated) return c.json(error("NOT_FOUND", "Target not found"), 404);
  return c.json(success(updated), 200);
});

xapiTargetRoutes.delete("/targets/:id", async (c) => {
  const userId = requireUser(c);
  const deleted = await deleteTarget(userId, c.req.param("id"));
  if (!deleted) return c.json(error("NOT_FOUND", "Target not found"), 404);
  return c.json(success({ deleted }), 200);
});
