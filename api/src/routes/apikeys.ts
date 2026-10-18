import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import { createApiKey, listApiKeys, renameApiKey, revokeApiKey } from "../services/settings/apiKeysService.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const apiKeyRoutes = new Hono<AppEnv>();

const CreateKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()).default([]),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/apikeys — list keys (prefix + metadata only, never the full key)
// ---------------------------------------------------------------------------
apiKeyRoutes.get("/", requirePro("API Access"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listApiKeys(userId)), 200);
});

// ---------------------------------------------------------------------------
// POST /api/apikeys — create a new key (full key returned ONCE)
// ---------------------------------------------------------------------------
apiKeyRoutes.post("/", requirePro("API Access"), validateJson(CreateKeySchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await createApiKey(userId, c.req.valid("json"))), 201);
});

// ---------------------------------------------------------------------------
// DELETE /api/apikeys/:id — revoke a key
// ---------------------------------------------------------------------------
apiKeyRoutes.delete("/:id", requirePro("API Access"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await revokeApiKey(userId, c.req.param("id"))), 200);
});

// ---------------------------------------------------------------------------
// PATCH /api/apikeys/:id — rename a key
// ---------------------------------------------------------------------------
apiKeyRoutes.patch("/:id", requirePro("API Access"), async (c) => {
  const userId = requireUser(c);

  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : null;
  if (!name) return c.json(error("VALIDATION_ERROR", "name is required"), 400);

  return c.json(success(await renameApiKey(userId, c.req.param("id"), name)), 200);
});
