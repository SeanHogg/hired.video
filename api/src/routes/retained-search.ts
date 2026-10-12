/**
 * /api/retained-search — public directory of retained executive-search
 * firms (#1675). Read-only public surface for the senior-exec audience.
 *
 *   GET /api/retained-search/firms?region=US&specialty=technology
 *
 * Filters are optional; both narrow the active set. Region matches the
 * firm's `regions` ISO2 array; specialty matches the `specialties` array.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { listRetainedSearchFirms } from "../services/retained-search/firm-directory.js";

export const retainedSearchRoutes = new Hono<AppEnv>();

retainedSearchRoutes.get("/firms", async (c) => {
  const region = (c.req.query("region") ?? "").trim().toUpperCase();
  const specialty = (c.req.query("specialty") ?? "").trim().toLowerCase();
  const rows = await listRetainedSearchFirms({ region, specialty });
  return c.json(success(rows), 200);
});
