/**
 * /api/integrations — generic self-serve API-key vendor integrations
 * registry (#261). Workspace admins paste credentials for any vendor that
 * doesn't warrant a custom connector.
 *
 *   GET    /            — list configured integrations for the workspace
 *   POST   /            — add one (provider + slug + raw credentials)
 *   PATCH  /:id         — toggle active / rotate the secret
 *   DELETE /:id         — remove one
 *
 * Owner scope rides the `?workspace=` param (personal | company:<id> |
 * delegated:<id>) and is verified through `resolveWorkspaceForWrite` — the
 * same canActFor SSoT the social-connection routes use. The service then
 * re-asserts the admin gate before any write. Raw credentials are NEVER
 * returned: responses carry only provider / slug / is_active / last4.
 */
import { Hono } from "hono";
import { requestEnv } from "../utils/env.js";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { parseWorkspaceParam } from "../services/paid-media/oauth.js";
import { resolveWorkspaceForWrite } from "../services/studio/workspace.js";
import { tenantIntegrationsService } from "../services/integrations/TenantIntegrationsService.js";
import type { OwnerScope } from "../repositories/tenantIntegrationsRepository.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const integrationsRoutes = new Hono<AppEnv>();

const buildService = (c: unknown) => tenantIntegrationsService(requestEnv(c));

/** Resolve + verify the workspace owner the integration belongs to. */
async function resolveScope(workspace: string | undefined, userId: string): Promise<OwnerScope> {
  const selection = parseWorkspaceParam(workspace ?? "personal");
  const ctx = await resolveWorkspaceForWrite(userId, selection);
  return { userId: ctx.ownerUserId, companyId: ctx.ownerCompanyId };
}

const CreateSchema = z.object({
  provider: z.string().min(1).max(64),
  slug: z.string().min(1).max(64),
  credentials: z.string().min(1).max(8192),
});

const UpdateSchema = z
  .object({
    isActive: z.boolean().optional(),
    credentials: z.string().min(1).max(8192).optional(),
  })
  .refine((v) => v.isActive !== undefined || v.credentials !== undefined, {
    message: "Provide isActive and/or credentials to update.",
  });

// ─── GET / — list ──────────────────────────────────────────────────────────
integrationsRoutes.get("/", async (c) => {
  const userId = requireUser(c);
  const scope = await resolveScope(c.req.query("workspace"), userId);
  const integrations = await buildService(c).list(userId, scope);
  return c.json(success({ integrations }), 200);
});

// ─── POST / — create ───────────────────────────────────────────────────────
integrationsRoutes.post("/", validateJson(CreateSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const body = c.req.valid("json");
  const scope = await resolveScope(c.req.query("workspace"), userId);
  const integration = await buildService(c).create(userId, scope, body);
  return c.json(success({ integration }), 201);
});

// ─── PATCH /:id — toggle active / rotate secret ────────────────────────────
integrationsRoutes.patch("/:id", validateJson(UpdateSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const body = c.req.valid("json");
  const scope = await resolveScope(c.req.query("workspace"), userId);
  const integration = await buildService(c).update(userId, scope, c.req.param("id"), body);
  return c.json(success({ integration }), 200);
});

// ─── DELETE /:id — remove ──────────────────────────────────────────────────
integrationsRoutes.delete("/:id", async (c) => {
  const userId = requireUser(c);
  const scope = await resolveScope(c.req.query("workspace"), userId);
  await buildService(c).remove(userId, scope, c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
});

// NB: no `.all("*")` catch-all here. This sub-app is mounted at the
// `/api/integrations` PARENT prefix, which also owns `/api/integrations/email/*`
// — a wildcard here would shadow those routes (the Hono parent-prefix gotcha).
// Unmatched paths fall through to the app-level notFound handler.
