/**
 * Promotion queue client (Lane A, #2046) — /api/promotions (creator) and
 * /api/admin/promotions (SuperAdmin review).
 */
import { apiClient } from "@/lib/api-client";
import type { PromotionPlatform, PromotionStatus } from "@shared/promotions";

export interface PromotionSubmission {
  id: string;
  projectId: string;
  submittedBy: string;
  platform: PromotionPlatform;
  status: PromotionStatus;
  title: string;
  description: string;
  reviewedAt: string | null;
  rejectReason: string | null;
  externalUrl: string | null;
  lastError: string | null;
  screeningVerdict: "pass" | "flag" | "block" | "unscreened";
  screeningNotes: string | null;
  createdAt: string;
}

export interface ReachSummary {
  platforms: Array<{ platform: PromotionPlatform; posts: number; views: number | null }>;
}

export interface ProjectPromotions {
  /** `views` is null when the platform has no stats reader yet. */
  submissions: Array<PromotionSubmission & { views: number | null }>;
  platforms: Array<{ platform: PromotionPlatform; ready: boolean }>;
}

export const promotionService = {
  async forProject(projectId: string): Promise<ProjectPromotions> {
    const res = await apiClient.get<ProjectPromotions>(`/api/promotions/project/${projectId}`);
    return res.data;
  },
  /** `variantVideoId`: the fitted cut for this platform (#2045), when the master doesn't fit it. */
  async submit(input: {
    projectId: string;
    platform: PromotionPlatform;
    title: string;
    description: string;
    variantVideoId?: string;
  }): Promise<PromotionSubmission> {
    const res = await apiClient.post<PromotionSubmission>("/api/promotions", input);
    return res.data;
  },
  async queue(status: PromotionStatus): Promise<PromotionSubmission[]> {
    const res = await apiClient.get<{ submissions: PromotionSubmission[] }>(`/api/admin/promotions?status=${status}`);
    return res.data.submissions;
  },
  async reach(): Promise<ReachSummary> {
    const res = await apiClient.get<ReachSummary>("/api/admin/promotions/reach");
    return res.data;
  },
  async approve(id: string): Promise<PromotionSubmission> {
    const res = await apiClient.post<PromotionSubmission>(`/api/admin/promotions/${id}/approve`, {});
    return res.data;
  },
  async reject(id: string, reason: string): Promise<PromotionSubmission> {
    const res = await apiClient.post<PromotionSubmission>(`/api/admin/promotions/${id}/reject`, { reason });
    return res.data;
  },
};
