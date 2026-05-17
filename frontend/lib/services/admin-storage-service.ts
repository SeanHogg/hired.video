/**
 * Admin storage service — typed client for /api/admin/r2/*.
 * SuperAdmin-only; the backend enforces it via the shared middleware.
 */

import { z } from "zod";
import { apiClient } from "../api-client";

const UsageBreakdownEntry = z.object({
  userId: z.string().nullable(),
  bucketKind: z.enum(["user", "other", "shared"]).optional(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  bytes: z.number(),
  objectCount: z.number(),
});

const UsageResponse = z.object({
  totalBytes: z.number(),
  objectCount: z.number(),
  truncated: z.boolean(),
  breakdown: z.array(UsageBreakdownEntry),
});
export type UsageBreakdown = z.infer<typeof UsageBreakdownEntry>;
export type Usage = z.infer<typeof UsageResponse>;

const OrphanEntry = z.object({
  key: z.string(),
  size: z.number(),
  uploaded: z.string(),
  // The backend explains WHY an object was flagged (owner gone, no DB row,
  // unknown prefix) so admins can sanity-check before bulk-deleting.
  reason: z.string().nullable().optional(),
});
const OrphansResponse = z.object({
  totalOrphanBytes: z.number(),
  orphanCount: z.number(),
  truncated: z.boolean(),
  orphans: z.array(OrphanEntry),
  // Per-table failures from the DB-key UNION. Surfaced as a warning banner
  // so admins know the orphan list may be incomplete — bulk-deleting while
  // this is non-empty risks reclaiming keys whose owning table simply
  // failed to load.
  dbErrors: z.array(z.object({ label: z.string(), error: z.string() })).optional(),
});
export type OrphanEntry = z.infer<typeof OrphanEntry>;
export type Orphans = z.infer<typeof OrphansResponse>;

const BulkDeleteResultEntry = z.object({
  key: z.string(),
  deleted: z.boolean(),
  freedBytes: z.number(),
  error: z.string().optional(),
});
const BulkDeleteResponse = z.object({
  requested: z.number(),
  deletedCount: z.number(),
  totalFreedBytes: z.number(),
  results: z.array(BulkDeleteResultEntry),
});
export type BulkDeleteResult = z.infer<typeof BulkDeleteResponse>;

export const adminStorageService = {
  async getUsage(): Promise<Usage> {
    const res = await apiClient.get("/api/admin/r2/usage", UsageResponse);
    return res.data!;
  },

  async getOrphans(): Promise<Orphans> {
    const res = await apiClient.get("/api/admin/r2/orphans", OrphansResponse);
    return res.data!;
  },

  /** Single OR batched delete (server caps the batch at 500 keys). */
  async bulkDeleteObjects(keys: string[]): Promise<BulkDeleteResult> {
    const res = await apiClient.post(
      "/api/admin/r2/objects/bulk-delete",
      { keys },
      BulkDeleteResponse,
    );
    return res.data!;
  },
};
