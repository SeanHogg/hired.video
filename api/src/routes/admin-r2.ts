/**
 * SuperAdmin R2 video-bucket tools — mounted at /api/admin/r2 by the admin
 * composite (routes/admin/index.ts), which applies the SA guard.
 *
 *   GET  /usage                — bytes per user + grand total
 *   GET  /orphans              — keys with no owning DB row AND no live user
 *   POST /objects/bulk-delete  — single OR batched delete { keys: string[] }
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { error } from "../types/index.js";
import { ok } from "../utils/response.js";
import { clampLimit } from "../utils/pagination.js";
import { getVideoBucket } from "../services/storage/object-store.js";
import { deleteObjects, storageOrphans, storageUsage } from "../services/admin/AdminStorageService.js";

export const adminR2Routes = new Hono<AppEnv>();

const unavailable = () => error("R2_UNAVAILABLE", "R2 binding not configured");

const BulkDeleteSchema = z.object({
  keys: z.array(z.string().min(1)).min(1).max(500),
});

adminR2Routes.get("/usage", async (c) => {
  const r2 = getVideoBucket();
  if (!r2) return c.json(unavailable(), 500);
  return c.json(ok(await storageUsage(r2, clampLimit(c.req.query("limit"), 10_000, 50_000, 100))));
});

adminR2Routes.get("/orphans", async (c) => {
  const r2 = getVideoBucket();
  if (!r2) return c.json(unavailable(), 500);
  return c.json(ok(await storageOrphans(r2, clampLimit(c.req.query("limit"), 10_000, 50_000, 100))));
});

adminR2Routes.post("/objects/bulk-delete", async (c) => {
  const r2 = getVideoBucket();
  if (!r2) return c.json(unavailable(), 500);
  const parsed = BulkDeleteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Bad payload", parsed.error.flatten()), 400);
  return c.json(ok(await deleteObjects(r2, parsed.data.keys)));
});
