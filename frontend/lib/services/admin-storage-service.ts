/**
 * Admin storage service — typed client for /api/admin/r2/*.
 * SuperAdmin-only; the backend enforces it via the shared middleware.
 */

import { z } from "zod";
import { apiClient } from "../api-client";

const UsageBreakdownEntry = z.object({
  userId: z.string().nullable(),
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
});
const OrphansResponse = z.object({
  totalOrphanBytes: z.number(),
  orphanCount: z.number(),
  truncated: z.boolean(),
  orphans: z.array(OrphanEntry),
});
export type OrphanEntry = z.infer<typeof OrphanEntry>;
export type Orphans = z.infer<typeof OrphansResponse>;

const DeleteResponse = z.object({
  deleted: z.literal(true),
  key: z.string(),
  freedBytes: z.number(),
});

export const adminStorageService = {
  async getUsage(): Promise<Usage> {
    const res = await apiClient.get("/api/admin/r2/usage", UsageResponse);
    return res.data!;
  },

  async getOrphans(): Promise<Orphans> {
    const res = await apiClient.get("/api/admin/r2/orphans", OrphansResponse);
    return res.data!;
  },

  async deleteObject(key: string): Promise<{ key: string; freedBytes: number }> {
    const res = await apiClient.delete(
      `/api/admin/r2/object?key=${encodeURIComponent(key)}`,
      DeleteResponse,
    );
    return { key: res.data!.key, freedBytes: res.data!.freedBytes };
  },
};
