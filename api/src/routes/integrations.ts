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
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { parseWorkspaceParam } from "../services/paid-media/oauth.js";
import {
  resolveWorkspaceForWrite,
  WorkspaceForbiddenError,
} from "../services/studio/workspace.js";
import {
  TenantIntegrationsService,
  TenantIntegrationError,
} from "../services/integrations/TenantIntegrationsService.js";
import type { OwnerScope } from "../repositories/tenantIntegrationsRepository.js";

export const integrationsRoutes = new Hono<AppEnv>();


function buildService(c: any): TenantIntegrationsService {
  return new TenantIntegrationsService({
    repos: buildRepos(getDb()),
    env: requestEnv(c),
  });
}

/** Resolve + verify the workspace owner the integration belongs to. */
async function resolveScope(c: any): Promise<OwnerScope> {
  const userId = c.var.user.sub as string;
  const selection = parseWorkspaceParam(c.req.query("workspace") ?? "personal");
  const ctx = await resolveWorkspaceForWrite(userId, selection, { db: getDb() });
  return { userId: ctx.ownerUserId, companyId: ctx.ownerCompanyId };
}

function mapError(c: any, err: unknown) {
  if (err instanceof WorkspaceForbiddenError) {
    return c.json(error("WORKSPACE_FORBIDDEN", err.message), 403);
  }
  if (err instanceof TenantIntegrationError) {
    const status =
      err.code === "NOT_FOUND"
        ? 404
        : err.code === "FORBIDDEN"
          ? 403
          : err.code === "CONFLICT"
            ? 409
            : 400;
    return c.json(error(err.code, err.message), status as 400 | 403 | 404 | 409);
  }
  throw err;
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
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const scope = await resolveScope(c);
    const integrations = await buildService(c).list(userId, scope);
    return c.json(success({ integrations }), 200);
  } catch (err) {
    return mapError(c, err);
  }
});

// ─── POST / — create ───────────────────────────────────────────────────────
integrationsRoutes.post("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  try {
    const scope = await resolveScope(c);
    const integration = await buildService(c).create(userId, scope, parsed.data);
    return c.json(success({ integration }), 201);
  } catch (err) {
    return mapError(c, err);
  }
});

// ─── PATCH /:id — toggle active / rotate secret ────────────────────────────
integrationsRoutes.patch("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  try {
    const scope = await resolveScope(c);
    const integration = await buildService(c).update(
      userId,
      scope,
      c.req.param("id"),
      parsed.data,
    );
    return c.json(success({ integration }), 200);
  } catch (err) {
    return mapError(c, err);
  }
});

// ─── DELETE /:id — remove ──────────────────────────────────────────────────
integrationsRoutes.delete("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const scope = await resolveScope(c);
    await buildService(c).remove(userId, scope, c.req.param("id"));
    return c.json(success({ deleted: true }), 200);
  } catch (err) {
    return mapError(c, err);
  }
});

// NB: no `.all("*")` catch-all here. This sub-app is mounted at the
// `/api/integrations` PARENT prefix, which also owns `/api/integrations/email/*`
// — a wildcard here would shadow those routes (the Hono parent-prefix gotcha).
// Unmatched paths fall through to the app-level notFound handler.
