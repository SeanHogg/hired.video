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
import {
  LRS_PERMISSIONS,
  createCredential,
  listCredentials,
  revokeCredential,
  rotateCredential,
  updateCredential,
} from "../../../services/learning/xapi-use-cases.js";
import { requireUser } from "../../helpers/routerHelpers.js";
import { validateJson } from "../../helpers/validate.js";

export const xapiCredentialRoutes = new Hono<{ Variables: Variables } & AppEnv>();

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
  const userId = requireUser(c);
  return c.json(success(await listCredentials(userId)), 200);
});

xapiCredentialRoutes.post("/credentials", validateJson(CreateSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return c.json(success(await createCredential(userId, body.label, body.permission)), 201);
});

xapiCredentialRoutes.post("/credentials/:id/rotate", async (c) => {
  const userId = requireUser(c);
  const rotated = await rotateCredential(userId, c.req.param("id"));
  if (!rotated) return c.json(error("NOT_FOUND", "Credential not found"), 404);
  return c.json(success(rotated), 200);
});

xapiCredentialRoutes.patch("/credentials/:id", validateJson(UpdateSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const view = await updateCredential(userId, c.req.param("id"), body);
  if (!view) return c.json(error("NOT_FOUND", "Credential not found"), 404);
  return c.json(success(view), 200);
});

xapiCredentialRoutes.delete("/credentials/:id", async (c) => {
  const userId = requireUser(c);
  const revoked = await revokeCredential(userId, c.req.param("id"));
  if (!revoked) return c.json(error("NOT_FOUND", "Credential not found"), 404);
  return c.json(success({ revoked }), 200);
});
