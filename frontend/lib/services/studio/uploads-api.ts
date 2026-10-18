// Studio media uploads (rendered video, scene image/audio) — part of the
// `studioService` facade in studio-service.ts.
import { z } from "zod";
import { apiClient } from "../../api-client";
import { uploadFile } from "../upload-service";
import type { ApiSuccessResponse } from "@shared/api";
import { StudioProjectSchema, type StudioProject } from "./project-schemas";

export const studioUploadsApi = {
  /**
   * Upload a recorded video blob (multipart/form-data).
   * Returns the newly created studio project.
   */
  async uploadVideo(
    blob: Blob,
    title: string,
    projectId?: string,
    resumeId?: string,
    resolution?: "720p" | "1080p" | "4k",
    /** The render carries the hired.video watermark (promotion requires it). */
    branded?: boolean,
  ): Promise<ApiSuccessResponse<StudioProject>> {
    const formData = new FormData();
    // The name only sets the stored key's extension — match the real container.
    formData.append("video", blob, blob.type.includes("mp4") ? "studio-video.mp4" : "studio-video.webm");
    formData.append("title", title);
    if (projectId) formData.append("projectId", projectId);
    if (resumeId) formData.append("resumeId", resumeId);
    if (resolution) formData.append("resolution", resolution); // gap #133 — 4K Pro gate
    if (branded !== undefined) formData.append("branded", String(branded));

    return apiClient.post("/api/studio/upload", formData, StudioProjectSchema);
  },

  /**
   * Upload a scene background image file to persistent storage (R2/S3).
   * Returns a CDN URL that can be saved in the script and reloaded later.
   */
  async uploadSceneImage(file: File): Promise<ApiSuccessResponse<{ url: string }>> {
    const form = new FormData();
    form.append("file", file);
    return apiClient.post("/api/upload/image", form, z.object({ url: z.string() }));
  },

  /**
   * Upload a scene audio file to persistent storage (R2/S3).
   * Returns a CDN URL that can be saved in the script and reloaded later.
   */
  async uploadSceneAudio(file: File): Promise<ApiSuccessResponse<{ url: string }>> {
    // POST /api/upload/single is owned by upload-service.uploadFile.
    return { success: true, data: { url: await uploadFile(file) } };
  },
};
