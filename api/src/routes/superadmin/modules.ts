import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../../types/index.js";
import { listModules, createModule, updateModule } from "../../services/auth/adminModules.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

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
  return c.json(success(await listModules()), 200);
});

moduleRoutes.post("/", validateJson(CreateModuleSchema, (e) => error("BAD_REQUEST", e.issues[0].message)), async (c) => {
  const body = c.req.valid("json");

  const mod = await createModule(c.var.userId, body);
  return c.json(success(mod), 201);
});

moduleRoutes.put("/:id", validateJson(UpdateModuleSchema, (e) => error("BAD_REQUEST", e.issues[0].message)), async (c) => {
  const body = c.req.valid("json");

  const result = await updateModule(c.var.userId, c.req.param("id"), body);
  if (!result.ok) return c.json(error("NOT_FOUND", "Module not found"), 404);
  return c.json(success(result.mod), 200);
});
