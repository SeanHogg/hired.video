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
import { and, asc, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { retainedSearchFirms } = schema;

export const retainedSearchRoutes = new Hono<AppEnv>();

retainedSearchRoutes.get("/firms", async (c) => {
  const region = (c.req.query("region") ?? "").trim().toUpperCase();
  const specialty = (c.req.query("specialty") ?? "").trim().toLowerCase();
  const db = getDb();

  const where = [eq(retainedSearchFirms.isActive, true)];
  // jsonb array containment — `regions @> '["US"]'` / `specialties @> '["technology"]'`.
  if (region) {
    where.push(sql`${retainedSearchFirms.regions} @> ${JSON.stringify([region])}::jsonb`);
  }
  if (specialty) {
    where.push(sql`${retainedSearchFirms.specialties} @> ${JSON.stringify([specialty])}::jsonb`);
  }

  const rows = await db
    .select()
    .from(retainedSearchFirms)
    .where(and(...where))
    .orderBy(asc(retainedSearchFirms.tier), asc(retainedSearchFirms.sortOrder), asc(retainedSearchFirms.name));

  return c.json(success(rows), 200);
});
