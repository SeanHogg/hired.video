import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";

/**
 * Video generation status enum
 */
export enum VideoGenerationStatus {
  Queued = "Queued",
  Processing = "Processing",
  Completed = "Completed",
  Failed = "Failed",
  Cancelled = "Cancelled",
}

/**
 * Video DTO schema
 */
export const VideoSchema = z.object({
  id: z.string(),
  resumeId: z.string(),
  userId: z.string(),
  status: z.nativeEnum(VideoGenerationStatus),
  filePath: z.string().nullable(),
  includeAvatar: z.boolean(),
  scenePrompt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  operationId: z.string().nullable(),
  generatedImagePath: z.string().nullable(),
  generationStartedAt: z.string().nullable(),
  generationCompletedAt: z.string().nullable(),
  retryCount: z.number(),
  creationDateTime: z.string(),
  updateDateTime: z.string(),
});

export type Video = z.infer<typeof VideoSchema>;

/**
 * Create video request schema
 */
export const CreateVideoRequestSchema = z.object({
  resumeId: z.string(),
  includeAvatar: z.boolean().default(false),
  customScenePrompt: z.string().optional(),
});

export type CreateVideoRequest = z.infer<typeof CreateVideoRequestSchema>;

/**
 * Video status response schema
 */
export const VideoStatusResponseSchema = z.object({
  id: z.string(),
  status: z.nativeEnum(VideoGenerationStatus),
  progressPercentage: z.number(),
  estimatedTimeRemaining: z.number().nullable(),
  errorMessage: z.string().nullable(),
  filePath: z.string().nullable(),
});

export type VideoStatusResponse = z.infer<typeof VideoStatusResponseSchema>;

/**
 * Enhanced summary response schema
 */
export const EnhancedSummaryResponseSchema = z.object({
  enhancedSummary: z.string(),
  suggestedScenePrompt: z.string(),
});

export type EnhancedSummaryResponse = z.infer<
  typeof EnhancedSummaryResponseSchema
>;

/**
 * Video service for API interactions
 */
export const videoService = {
  /**
   * Initiate video generation
   */
  async createVideo(
    request: CreateVideoRequest,
  ): Promise<ApiSuccessResponse<Video>> {
    return apiClient.post("/api/Video/generate", request, VideoSchema);
  },

  /**
   * Get video details
   */
  async getVideo(videoId: string): Promise<ApiSuccessResponse<Video>> {
    return apiClient.get(`/api/Video/${videoId}`, VideoSchema);
  },

  /**
   * Get all videos for current user
   */
  async getUserVideos(): Promise<ApiSuccessResponse<Video[]>> {
    return apiClient.get(
      "/api/Video/user/all",
      z.array(VideoSchema),
    );
  },

  /**
   * Get all videos for a specific resume
   */
  async getResumeVideos(
    resumeId: string,
  ): Promise<ApiSuccessResponse<Video[]>> {
    return apiClient.get(
      `/api/Video/resume/${resumeId}`,
      z.array(VideoSchema),
    );
  },

  /**
   * Check video generation status
   */
  async getVideoStatus(
    videoId: string,
  ): Promise<ApiSuccessResponse<VideoStatusResponse>> {
    return apiClient.get(
      `/api/Video/${videoId}/status`,
      VideoStatusResponseSchema,
    );
  },

  /**
   * Cancel video generation
   */
  async cancelVideo(videoId: string): Promise<ApiSuccessResponse<Video>> {
    return apiClient.post(`/api/Video/${videoId}/cancel`, {}, VideoSchema);
  },

  /**
   * Delete video
   */
  async deleteVideo(videoId: string): Promise<ApiSuccessResponse<void>> {
    return apiClient.delete(`/api/Video/${videoId}`, z.void());
  },

  /**
   * Enhance summary with AI
   */
  async enhanceSummary(
    resumeId: string,
    summary: string,
  ): Promise<ApiSuccessResponse<EnhancedSummaryResponse>> {
    return apiClient.post(
      "/api/Video/enhance-summary",
      { resumeId, summary },
      EnhancedSummaryResponseSchema,
    );
  },

  /**
   * Check if video generation is allowed for resume
   */
  async canGenerateVideo(
    resumeId: string,
  ): Promise<ApiSuccessResponse<{ canGenerate: boolean; reason?: string }>> {
    return apiClient.get(
      `/api/Video/resume/${resumeId}/can-generate`,
      z.object({
        canGenerate: z.boolean(),
        reason: z.string().optional(),
      }),
    );
  },

  /**
   * Get active video generation for resume
   */
  async getActiveVideoGeneration(
    resumeId: string,
  ): Promise<ApiSuccessResponse<Video | null>> {
    return apiClient.get(
      `/api/Video/resume/${resumeId}/active`,
      VideoSchema.nullable(),
    );
  },
};

