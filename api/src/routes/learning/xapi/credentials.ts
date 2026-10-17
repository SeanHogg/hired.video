/**
 * LRS credential management (mig 0490) — authenticated, owner-scoped CRUD for
 * the Basic-auth credentials external tools use against our conformant xAPI
 * LRS. Behind the normal JWT layer. The credential SECRET is returned exactly
 * once, on create/rotate, alongside the LRS `endpoint` to paste into tools.
 *
 *   GET    /credentials
 *   POST   /credentials
 *   POST   /credentials/:id/rotate
 *   PATCH  /credentials/:id
 *   DELETE /credentials/:id          — soft-revoke (active=false)
 *
 * Not cached: a small, per-user, security-sensitive list that MUST reflect a
 * revoke/rotate immediately.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../../../types/index.js";
import { success, error } from "../../../types/index.js";
import { LRS_PERMISSIONS } from "../../../db/schema/learning.js";
import {
  createCredential,
  listCredentials,
  revokeCredential,
  rotateCredential,
  updateCredential,
} from "../../../services/learning/xapi-use-cases.js";

export const xapiCredentialRoutes = new Hono<{ Variables: Variables } & AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const CreateSchema = z.object({
  label: z.string().min(1).max(200),
  permission: z.enum(LRS_PERMISSIONS).default("read_write"),
});

const UpdateSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  permission: z.enum(LRS_PERMISSIONS).optional(),
  active: z.boolean().optional(),
});

xapiCredentialRoutes.get("/credentials", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(success(await listCredentials(userId)), 200);
});

xapiCredentialRoutes.post("/credentials", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  return c.json(success(await createCredential(userId, parsed.data.label, parsed.data.permission)), 201);
});

xapiCredentialRoutes.post("/credentials/:id/rotate", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const rotated = await rotateCredential(userId, c.req.param("id"));
  if (!rotated) return c.json(error("NOT_FOUND", "Credential not found"), 404);
  return c.json(success(rotated), 200);
});

xapiCredentialRoutes.patch("/credentials/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = UpdateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  const view = await updateCredential(userId, c.req.param("id"), parsed.data);
  if (!view) return c.json(error("NOT_FOUND", "Credential not found"), 404);
  return c.json(success(view), 200);
});

xapiCredentialRoutes.delete("/credentials/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const revoked = await revokeCredential(userId, c.req.param("id"));
  if (!revoked) return c.json(error("NOT_FOUND", "Credential not found"), 404);
  return c.json(success({ revoked }), 200);
});
