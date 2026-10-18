// Published-video reads, embeds and per-project event counts — part of the
// `studioService` facade in studio-service.ts.
import { z } from "zod";
import { apiClient } from "../../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import {
  PublicVideoSchema,
  ResumeVideoSchema,
  StudioVideoEmbedSchema,
  StudioVideoEventCountsSchema,
  UserVideoSchema,
  type PublicVideo,
  type ResumeVideo,
  type StudioVideoEmbed,
  type StudioVideoEventCounts,
  type UserVideo,
} from "./video-schemas";

export const studioVideosApi = {
  /**
   * Get all videos associated with a specific resume (public + owner's own).
   */
  async getVideosForResume(resumeId: string): Promise<ApiSuccessResponse<ResumeVideo[]>> {
    return apiClient.get(
      `/api/studio/videos/resume/${resumeId}`,
      z.array(ResumeVideoSchema),
    );
  },

  /**
   * Get the 20 most-recent public videos for the discovery feed.
   * The homepage hero carousel uses `getFeaturedVideos` below instead.
   */
  async getPublicVideos(): Promise<ApiSuccessResponse<PublicVideo[]>> {
    return apiClient.get(
      "/api/studio/public",
      z.array(PublicVideoSchema),
    );
  },

  /**
   * Get the SuperAdmin-curated featured videos that feed the homepage
   * hero carousel. Returns only is_featured=true public videos, ordered
   * by most-recently-promoted first. Empty when nothing is featured —
   * the hero falls back to its skeleton state.
   */
  async getFeaturedVideos(): Promise<ApiSuccessResponse<PublicVideo[]>> {
    return apiClient.get(
      "/api/studio/videos/featured",
      z.array(PublicVideoSchema),
    );
  },

  /**
   * Get published studio videos for a user (for profile display).
   */
  async getVideosForUser(userId: string): Promise<ApiSuccessResponse<UserVideo[]>> {
    return apiClient.get(`/api/studio/videos/user/${userId}`, z.array(UserVideoSchema));
  },

  // ── Video embed + per-project event counts ─────────────────────────────────

  /** Fetch the studio's iframe-embed snippet for a published video. */
  async getVideoEmbed(videoId: string): Promise<ApiSuccessResponse<StudioVideoEmbed>> {
    return apiClient.get(`/api/studio/videos/${videoId}/embed`, StudioVideoEmbedSchema);
  },

  /** Aggregate views / CTA clicks / shares / CTR for a single project.
   *  Pro-gated. Re-keyed from videoId in migration 0085. */
  async getVideoEventCounts(projectId: string): Promise<ApiSuccessResponse<StudioVideoEventCounts>> {
    return apiClient.get(`/api/studio/projects/${projectId}/analytics`, StudioVideoEventCountsSchema);
  },
};
