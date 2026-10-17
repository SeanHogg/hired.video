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
import { actorId, fail, ok, studioErrorResponse } from "./http.js";

export const studioBrandKitRoutes = new Hono<AppEnv>();

studioBrandKitRoutes.get("/brand-kits", async (c) => {
  const userId = actorId(c);
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(ok(await listBrandKits(userId, parseWorkspaceQueryParam(c.req.query("workspace")))));
});

studioBrandKitRoutes.post("/brand-kits", requirePro("Brand Kits"), async (c) => {
  const userId = actorId(c);
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = BrandKitSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  try {
    return c.json(ok(await createBrandKit(userId, parsed.data, body)), 201);
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});

studioBrandKitRoutes.patch("/brand-kits/:id", requirePro("Brand Kits"), async (c) => {
  const userId = actorId(c);
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown> | null;
  try {
    return c.json(ok(await patchBrandKit(userId, c.req.param("id"), body ?? {})));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});

studioBrandKitRoutes.delete("/brand-kits/:id", async (c) => {
  const userId = actorId(c);
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  try {
    return c.json(ok(await removeBrandKit(userId, c.req.param("id"))));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});
