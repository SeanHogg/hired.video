import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";

// ─── Storyboard types ────────────────────────────────────────────────────────

export const StoryboardSceneSchema = z.object({
  duration: z.number(),
  type: z.enum(["intro", "achievement", "skills", "closing"]),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  text: z.string().optional(),
  skills: z.array(z.string()).optional(),
  visual: z.string(),
  camera: z.string(),
});

export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;

export const StoryboardSchema = z.object({
  style: z.object({
    theme: z.string(),
    color_palette: z.array(z.string()),
    font_style: z.string(),
  }),
  scenes: z.array(StoryboardSceneSchema),
});

export type Storyboard = z.infer<typeof StoryboardSchema>;

// ─── Studio project types ─────────────────────────────────────────────────────

export enum StudioProjectStatus {
  Draft = "Draft",
  Processing = "Processing",
  Publishing = "Publishing",
  Completed = "Completed",
  Failed = "Failed",
}

export const StudioProjectSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  status: z.nativeEnum(StudioProjectStatus),
  youtubeVideoId: z.string().nullable(),
  videoUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  storyboard: StoryboardSchema.nullable(),
  creationDateTime: z.string(),
  updateDateTime: z.string(),
});

export type StudioProject = z.infer<typeof StudioProjectSchema>;

export const StudioProjectStatusResponseSchema = z.object({
  id: z.string(),
  status: z.nativeEnum(StudioProjectStatus),
  progressPercentage: z.number(),
  youtubeVideoId: z.string().nullable(),
  videoUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export type StudioProjectStatusResponse = z.infer<
  typeof StudioProjectStatusResponseSchema
>;

// ─── Publish request ──────────────────────────────────────────────────────────

export interface PublishVideoRequest {
  title: string;
  description: string;
  tags?: string[];
  privacyStatus?: "public" | "private" | "unlisted";
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const studioService = {
  /**
   * Generate an AI storyboard from resume text.
   */
  async generateStoryboard(
    resumeText: string,
  ): Promise<ApiSuccessResponse<Storyboard>> {
    return apiClient.post(
      "/api/studio/storyboard",
      { resumeText },
      StoryboardSchema,
    );
  },

  /**
   * Upload a recorded video blob (multipart/form-data).
   * Returns the newly created studio project.
   */
  async uploadVideo(
    blob: Blob,
    title: string,
  ): Promise<ApiSuccessResponse<StudioProject>> {
    const formData = new FormData();
    formData.append("video", blob, "studio-video.webm");
    formData.append("title", title);

    return apiClient.post("/api/studio/upload", formData, StudioProjectSchema);
  },

  /**
   * Trigger YouTube publish for a completed upload.
   */
  async publishVideo(
    projectId: string,
    request: PublishVideoRequest,
  ): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.post(
      "/api/studio/publish",
      { projectId, ...request },
      StudioProjectSchema,
    );
  },

  /**
   * Poll for the publish/processing status of a project.
   */
  async getProjectStatus(
    projectId: string,
  ): Promise<ApiSuccessResponse<StudioProjectStatusResponse>> {
    return apiClient.get(
      `/api/studio/status/${projectId}`,
      StudioProjectStatusResponseSchema,
    );
  },

  /**
   * List all studio projects for the current user.
   */
  async getProjects(): Promise<ApiSuccessResponse<StudioProject[]>> {
    return apiClient.get(
      "/api/studio/projects",
      z.array(StudioProjectSchema),
    );
  },
};
