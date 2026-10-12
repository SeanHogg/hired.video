import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";

// ============================================================================
// YOUTUBE TYPES AND SCHEMAS
// ============================================================================

/**
 * YouTube account connection status
 */
export interface YouTubeAccount {
  /** Null when the Google account has no YouTube channel yet. */
  channelId?: string | null;
  channelTitle: string;
  channelThumbnail?: string;
  subscriberCount?: number;
  videoCount?: number;
  connectedAt: string;
}

export const YouTubeAccountSchema = z.object({
  channelId: z.string().nullable(),
  channelTitle: z.string(),
  channelThumbnail: z.string().optional(),
  subscriberCount: z.number().optional(),
  videoCount: z.number().optional(),
  connectedAt: z.string(),
});

/**
 * YouTube OAuth authorization URL response
 */
export interface YouTubeAuthUrlResponse {
  authUrl: string;
}

export const YouTubeAuthUrlResponseSchema = z.object({
  authUrl: z.string(),
});

/**
 * YouTube video publish request
 */
export interface YouTubePublishRequest {
  title: string;
  description: string;
  privacy: "public" | "private" | "unlisted";
  tags?: string[];
}

/**
 * YouTube video publish response
 */
export interface YouTubePublishResponse {
  youtubeVideoId: string;
  youtubeUrl: string;
}

export const YouTubePublishResponseSchema = z.object({
  youtubeVideoId: z.string(),
  youtubeUrl: z.string(),
});

// ============================================================================
// YOUTUBE SERVICE
// ============================================================================

/**
 * YouTube integration service for API interactions
 */
export const youtubeService = {
  /**
   * Get connected YouTube account information
   */
  async getAccount(): Promise<ApiSuccessResponse<YouTubeAccount | null>> {
    return apiClient.get("/api/YouTube/account", YouTubeAccountSchema.nullable());
  },

  /**
   * Get YouTube OAuth authorization URL
   */
  async getAuthUrl(): Promise<ApiSuccessResponse<YouTubeAuthUrlResponse>> {
    return apiClient.get("/api/YouTube/auth-url", YouTubeAuthUrlResponseSchema);
  },

  /**
   * Handle OAuth callback (exchange code for tokens)
   */
  async handleCallback(code: string): Promise<ApiSuccessResponse<YouTubeAccount>> {
    return apiClient.post(
      "/api/YouTube/callback",
      { code },
      YouTubeAccountSchema
    );
  },

  /**
   * Disconnect YouTube account
   */
  async disconnect(): Promise<ApiSuccessResponse<void>> {
    return apiClient.post("/api/YouTube/disconnect", {}, z.void());
  },

  /**
   * Publish a video to YouTube
   */
  async publishVideo(
    videoId: string,
    request: YouTubePublishRequest
  ): Promise<ApiSuccessResponse<YouTubePublishResponse>> {
    return apiClient.post(
      `/api/YouTube/publish/${videoId}`,
      request,
      YouTubePublishResponseSchema
    );
  },

  /**
   * Check if YouTube is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      const response = await this.getAccount();
      return response.data !== null;
    } catch {
      return false;
    }
  },
};

export default youtubeService;

