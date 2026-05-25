import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../../types/index.js";
import { ok } from "../../utils/response.js";
import { listModules, createModule, updateModule } from "../../services/auth/adminModules.js";

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateModuleSchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  description: z.string().max(1000).optional(),
  requiredRole: z.string().min(1, "requiredRole is required"),
  planTier: z.enum(["free", "pro", "enterprise"]).optional().default("free"),
  permissions: z.array(z.string()).optional().default([]),
});

const UpdateModuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  requiredRole: z.string().min(1).optional(),
  planTier: z.enum(["free", "pro", "enterprise"]).optional(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const moduleRoutes = new Hono<AppEnv>();

moduleRoutes.get("/", async (c) => {
  return c.json(ok(await listModules()), 200);
});

moduleRoutes.post("/", async (c) => {
  const body = CreateModuleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);

  const mod = await createModule(c.var.user.sub, body.data);
  return c.json(ok(mod), 201);
});

moduleRoutes.put("/:id", async (c) => {
  const body = UpdateModuleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);

  const result = await updateModule(c.var.user.sub, c.req.param("id"), body.data);
  if (!result.ok) return c.json({ error: { code: "NOT_FOUND", message: "Module not found" } }, 404);
  return c.json(ok(result.mod), 200);
});
