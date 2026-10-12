/**
 * Explicit-scan client (the home-wall gate, migration 0505). Owner side:
 * the scan status of a project's video + the sampled-frames upload.
 * SuperAdmin side: the review queue, the override, and the backfill.
 * Vocabulary: shared/moderation/explicit.ts.
 */
import { z } from "zod";
import { apiClient } from "../api-client";
import {
  EXPLICIT_CATEGORIES,
  SCAN_OVERRIDES,
  SCAN_VERDICTS,
  type ScanOverride,
} from "@shared/moderation/explicit";

const OwnerScanSchema = z.object({
  verdict: z.enum(SCAN_VERDICTS),
  categories: z.array(z.enum(EXPLICIT_CATEGORIES)),
});
export type OwnerScan = z.infer<typeof OwnerScanSchema>;

const ScanEnvelope = z.object({ scan: OwnerScanSchema.nullable() });

export const VideoScanReviewItemSchema = z.object({
  videoId: z.string(),
  title: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  videoUrl: z.string().nullable(),
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  verdict: z.enum(SCAN_VERDICTS),
  overrideVerdict: z.enum(SCAN_OVERRIDES).nullable(),
  categories: z.array(z.enum(EXPLICIT_CATEGORIES)),
  reason: z.string().nullable(),
  scannedAt: z.string(),
  reviewedAt: z.string().nullable(),
});
export type VideoScanReviewItem = z.infer<typeof VideoScanReviewItemSchema>;
export type VideoScanFilter = "needs_review" | "approved";

export const contentScanService = {
  /** The project's video verdict for the Post panel; null = not scanned yet. */
  async getProjectScan(projectId: string): Promise<OwnerScan | null> {
    const res = await apiClient.get(`/api/studio/projects/${projectId}/public-scan`, ScanEnvelope, { suppressErrorEvent: true });
    return res.data.scan;
  },

  /** Upload frames sampled from the render just hosted (≤ 12 small JPEGs). */
  async submitFrames(projectId: string, frames: readonly Blob[]): Promise<OwnerScan | null> {
    const form = new FormData();
    frames.forEach((frame, i) => form.append("frame", frame, `frame-${i}.jpg`));
    const res = await apiClient.post(`/api/studio/projects/${projectId}/public-scan`, form, ScanEnvelope);
    return res.data.scan;
  },

  // ── SuperAdmin ────────────────────────────────────────────────────────
  async listVideoScans(filter: VideoScanFilter): Promise<VideoScanReviewItem[]> {
    const res = await apiClient.get(
      `/api/admin/content-scans/videos?filter=${filter}`,
      z.object({ items: z.array(VideoScanReviewItemSchema) }),
    );
    return res.data.items;
  },

  async overrideVideoScan(videoId: string, override: ScanOverride): Promise<void> {
    await apiClient.post(`/api/admin/content-scans/videos/${videoId}/override`, { override });
  },

  async backfillVideoScans(limit = 10): Promise<number> {
    const res = await apiClient.post("/api/admin/content-scans/videos/backfill", { limit }, z.object({ scanned: z.number() }));
    return res.data.scanned;
  },
};
