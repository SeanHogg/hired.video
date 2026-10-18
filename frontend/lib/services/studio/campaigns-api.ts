// Video campaigns + Studio brand kits — part of the `studioService` facade
// in studio-service.ts.
import { z } from "zod";
import { apiClient } from "../../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import {
  CampaignStatsSchema,
  StudioBrandKitSchema,
  VideoCampaignSchema,
  type CampaignStats,
  type StudioBrandKit,
  type StudioBrandKitInput,
  type VideoCampaign,
} from "./video-schemas";

export const studioCampaignsApi = {
  // ── Video Campaigns ─────────────────────────────────────────────────────────

  async getCampaigns(): Promise<ApiSuccessResponse<VideoCampaign[]>> {
    return apiClient.get("/api/studio/campaigns", z.array(VideoCampaignSchema));
  },

  async createCampaign(data: {
    name: string;
    description?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    projectIds?: string[];
  }): Promise<ApiSuccessResponse<VideoCampaign>> {
    return apiClient.post("/api/studio/campaigns", data, VideoCampaignSchema);
  },

  async updateCampaign(id: string, data: Partial<{
    name: string;
    description: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    status: string;
    projectIds: string[];
  }>): Promise<ApiSuccessResponse<VideoCampaign>> {
    return apiClient.patch(`/api/studio/campaigns/${id}`, data, VideoCampaignSchema);
  },

  async deleteCampaign(id: string): Promise<ApiSuccessResponse<{ archived: boolean }>> {
    return apiClient.delete(`/api/studio/campaigns/${id}`, z.object({ archived: z.boolean() }));
  },

  async getCampaignStats(id: string): Promise<ApiSuccessResponse<CampaignStats>> {
    return apiClient.get(`/api/studio/campaigns/${id}/stats`, CampaignStatsSchema);
  },

  // ── Brand Kits (Studio) ─────────────────────────────────────────────────────

  async listBrandKits(): Promise<ApiSuccessResponse<StudioBrandKit[]>> {
    return apiClient.get("/api/studio/brand-kits", z.array(StudioBrandKitSchema));
  },

  async createBrandKit(data: StudioBrandKitInput): Promise<ApiSuccessResponse<StudioBrandKit>> {
    return apiClient.post("/api/studio/brand-kits", data, StudioBrandKitSchema);
  },

  async updateBrandKit(id: string, data: StudioBrandKitInput): Promise<ApiSuccessResponse<StudioBrandKit>> {
    return apiClient.patch(`/api/studio/brand-kits/${id}`, data, StudioBrandKitSchema);
  },

  async deleteBrandKit(id: string): Promise<ApiSuccessResponse<{ deleted: boolean }>> {
    return apiClient.delete(`/api/studio/brand-kits/${id}`, z.object({ deleted: z.boolean() }));
  },
};
