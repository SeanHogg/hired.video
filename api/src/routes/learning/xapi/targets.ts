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

export const xapiTargetRoutes = new Hono<{ Variables: Variables } & AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const ExternalLrsTargetSchema = z.object({
  endpoint: z.string().url(),
  authMode: z.enum(["basic", "bearer", "none"]).default("none"),
  authToken: z.string().min(1).max(2000).optional(),
  customHeaders: z.record(z.string().max(64), z.string().max(1024)).optional(),
  active: z.boolean().default(true),
});

xapiTargetRoutes.get("/targets", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(success({ targets: await listTargets(userId) }), 200);
});

xapiTargetRoutes.post("/targets", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ExternalLrsTargetSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  return c.json(success(await createTarget(userId, parsed.data)), 201);
});

xapiTargetRoutes.patch("/targets/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ExternalLrsTargetSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const updated = await updateTarget(userId, c.req.param("id"), parsed.data);
  if (!updated) return c.json(error("NOT_FOUND", "Target not found"), 404);
  return c.json(success(updated), 200);
});

xapiTargetRoutes.delete("/targets/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const deleted = await deleteTarget(userId, c.req.param("id"));
  if (!deleted) return c.json(error("NOT_FOUND", "Target not found"), 404);
  return c.json(success({ deleted }), 200);
});
