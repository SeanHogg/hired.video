/**
 * Brand Kit CRUD.
 *   GET    /api/studio/brand-kits      — list kits across my workspaces (?workspace=)
 *   POST   /api/studio/brand-kits      — create (Pro)
 *   PATCH  /api/studio/brand-kits/:id  — update (Pro)
 *   DELETE /api/studio/brand-kits/:id  — delete
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requirePro } from "../../middleware/tierEnforcement.js";
import {
  BrandKitSchema,
  createBrandKit,
  listBrandKits,
  patchBrandKit,
  removeBrandKit,
} from "../../services/studio/brand-kits.js";
import { parseWorkspaceQueryParam } from "../../services/studio/workspace-request.js";
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

export const studioBrandKitRoutes = new Hono<AppEnv>();

studioBrandKitRoutes.get("/brand-kits", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listBrandKits(userId, parseWorkspaceQueryParam(c.req.query("workspace")))));
});

studioBrandKitRoutes.post("/brand-kits", requirePro("Brand Kits"), validateJson(BrandKitSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  // The raw body too (Hono caches the parsed JSON) — the service reads extra fields off it.
  return c.json(success(await createBrandKit(userId, c.req.valid("json"), await c.req.json())), 201);
});

studioBrandKitRoutes.patch("/brand-kits/:id", requirePro("Brand Kits"), async (c) => {
  const userId = requireUser(c);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown> | null;
  return c.json(success(await patchBrandKit(userId, c.req.param("id"), body ?? {})));
});

studioBrandKitRoutes.delete("/brand-kits/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await removeBrandKit(userId, c.req.param("id"))));
});
