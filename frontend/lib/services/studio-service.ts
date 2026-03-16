import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import type { VideoScript } from "../../types/video-script";

export type { VideoScript };
export type { SceneScript } from "../../types/video-script";

// ─── VideoScript Zod schema (mirrors the TypeScript type) ────────────────────
// Used only for API response validation — the authoritative types live in
// frontend/types/video-script.ts.

const AnimationSpecSchema = z.object({
  type: z.enum(["fadeIn", "slideUp", "slideIn", "scaleIn", "typewriter", "none"]),
  start: z.number(),
  duration: z.number(),
  easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "spring"]).optional(),
});

const SceneEffectSchema = z.object({
  type: z.enum(["particles", "blur", "glow", "vignette"]),
  intensity: z.number(),
});

export const SceneScriptSchema = z.object({
  id: z.string(),
  start: z.number(),
  duration: z.number(),
  type: z.enum(["intro", "achievement", "skills", "closing"]),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  text: z.union([z.string(), z.array(z.string())]).optional(),
  items: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  highlight: z.boolean().optional(),
  animation: z.object({
    titleEnter: AnimationSpecSchema.optional(),
    subtitleEnter: AnimationSpecSchema.optional(),
    textEnter: AnimationSpecSchema.optional(),
  }).optional(),
  effects: z.array(SceneEffectSchema).optional(),
});

export const VideoScriptSchema = z.object({
  video: z.object({
    duration: z.number(),
    fps: z.number().default(30),
    resolution: z.enum(["720p", "1080p"]),
    aspect: z.enum(["16:9", "9:16", "1:1"]),
    theme: z.object({
      colorPalette: z.array(z.string()),
      fontFamily: z.string(),
      motion: z.enum(["minimal", "moderate", "cinematic"]),
      transition: z.enum(["cut", "fade", "slide", "cinematic-fade"]),
      background: z.enum(["gradient", "dark-tech-grid", "particles", "solid"]),
    }),
  }),
  scenes: z.array(SceneScriptSchema),
});

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

// ─── Published video types ───────────────────────────────────────────────────

export const ResumeVideoSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  videoUrl: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  youtubeVideoId: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  privacyStatus: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
});
export type ResumeVideo = z.infer<typeof ResumeVideoSchema>;

export const PublicVideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  videoUrl: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  youtubeVideoId: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  description: z.string().nullable(),
  ownerName: z.string(),
  resumeId: z.string().nullable(),
  createdAt: z.string(),
});
export type PublicVideo = z.infer<typeof PublicVideoSchema>;

export interface GenerateStoryboardParams {
  resumeText: string;
  resumeId?: string;
  prompt?: string;
  jobDescription?: string;
  model?: string;
  temperature?: number;
  targetDuration?: number;
  resolution?: "720p" | "1080p";
  motion?: "minimal" | "moderate" | "cinematic";
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const studioService = {
  /**
   * Generate an AI VideoScript from resume text.
   * The API first attempts a real LLM call (OpenRouter); falls back to a mock
   * storyboard if the key is missing or the call fails.
   */
  async generateStoryboard(
    paramsOrText: GenerateStoryboardParams | string,
    resumeId?: string,
  ): Promise<ApiSuccessResponse<VideoScript>> {
    const body: GenerateStoryboardParams =
      typeof paramsOrText === "string"
        ? { resumeText: paramsOrText, ...(resumeId ? { resumeId } : {}) }
        : paramsOrText;
    return apiClient.post("/api/studio/storyboard", body, VideoScriptSchema) as Promise<ApiSuccessResponse<VideoScript>>;
  },

  /**
   * Upload a recorded video blob (multipart/form-data).
   * Returns the newly created studio project.
   */
  async uploadVideo(
    blob: Blob,
    title: string,
    projectId?: string,
    resumeId?: string,
  ): Promise<ApiSuccessResponse<StudioProject>> {
    const formData = new FormData();
    formData.append("video", blob, "studio-video.webm");
    formData.append("title", title);
    if (projectId) formData.append("projectId", projectId);
    if (resumeId) formData.append("resumeId", resumeId);

    return apiClient.post("/api/studio/upload", formData, StudioProjectSchema);
  },

  /**
   * Trigger YouTube publish for a completed upload.
   */
  async publishVideo(
    projectId: string,
    request: PublishVideoRequest,
    resumeId?: string,
  ): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.post(
      "/api/studio/publish",
      { projectId, ...request, ...(resumeId ? { resumeId } : {}) },
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
   * Get the 20 most-recent public videos for the homepage feed.
   */
  async getPublicVideos(): Promise<ApiSuccessResponse<PublicVideo[]>> {
    return apiClient.get(
      "/api/studio/videos/public",
      z.array(PublicVideoSchema),
    );
  },

};
