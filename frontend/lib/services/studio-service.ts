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

// Free-form scene elements (text/image/video/audio with % positioning)
const ElementBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const ElementStyleSchema = z.object({
  backgroundColor: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().optional(),
  borderRadius: z.number().optional(),
  padding: z.number().optional(),
}).optional();

const BaseElementFields = {
  id: z.string(),
  box: ElementBoxSchema,
  style: ElementStyleSchema,
  z: z.number().optional(),
  rotation: z.number().optional(),
};

const SceneElementSchema = z.discriminatedUnion("kind", [
  z.object({
    ...BaseElementFields,
    kind: z.literal("text"),
    text: z.string(),
    fontSize: z.number().optional(),
    fontWeight: z.enum(["normal", "bold"]).optional(),
    fontFamily: z.string().optional(),
    color: z.string().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  }),
  z.object({
    ...BaseElementFields,
    kind: z.literal("image"),
    url: z.string(),
    fit: z.enum(["cover", "contain", "fill"]).optional(),
    animation: z.enum(["none", "zoom-in", "zoom-out", "pan-left", "pan-right"]).optional(),
  }),
  z.object({
    ...BaseElementFields,
    kind: z.literal("video"),
    url: z.string(),
    fit: z.enum(["cover", "contain", "fill"]).optional(),
    muted: z.boolean().optional(),
    loop: z.boolean().optional(),
  }),
  z.object({
    ...BaseElementFields,
    kind: z.literal("audio"),
    url: z.string(),
    label: z.string().optional(),
    volume: z.number().optional(),
  }),
  z.object({
    ...BaseElementFields,
    kind: z.literal("chips"),
    chips: z.array(z.string()),
    fontSize: z.number().optional(),
    fontFamily: z.string().optional(),
    chipColor: z.string().optional(),
    textColor: z.string().optional(),
    direction: z.enum(["row", "column"]).optional(),
  }),
]);

export const SceneScriptSchema = z.object({
  id: z.string(),
  start: z.number(),
  duration: z.number(),
  type: z.enum(["intro", "achievement", "skills", "closing", "job-details", "company-culture", "cta", "testimonial", "product-feature", "brand-story", "requirements", "benefits"]),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  text: z.union([z.string(), z.array(z.string())]).optional(),
  items: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  ctaText: z.string().optional(),
  highlight: z.boolean().optional(),
  animation: z.object({
    titleEnter: AnimationSpecSchema.optional(),
    subtitleEnter: AnimationSpecSchema.optional(),
    textEnter: AnimationSpecSchema.optional(),
  }).optional(),
  effects: z.array(SceneEffectSchema).optional(),
  accentColor: z.string().optional(),
  textColor: z.string().optional(),
  cardBackgroundColor: z.string().optional(),
  cardBorderColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  backgroundMediaType: z.enum(["image", "video"]).optional(),
  backgroundImagePosition: z.enum(["full","half-left","half-right","small-left","small-right","corner-tl","corner-tr","corner-bl","corner-br"]).optional(),
  overlayMediaUrl: z.string().optional(),
  overlayMediaType: z.enum(["image", "video"]).optional(),
  overlayMediaPosition: z.enum(["full","half-left","half-right","small-left","small-right","corner-tl","corner-tr","corner-bl","corner-br"]).optional(),
  overlayMediaAnimation: z.enum(["none","zoom-in","zoom-out","pan-left","pan-right"]).optional(),
  imageAnimation: z.enum(["none","zoom-in","zoom-out","pan-left","pan-right"]).optional(),
  sceneAudio: z.string().optional(),
  sceneAudioLabel: z.string().optional(),
  textAlign: z.enum(["left","center","right"]).optional(),
  contentPosition: z.enum(["top","center","bottom"]).optional(),
  sceneElements: z.array(SceneElementSchema).optional(),
});

export const VideoScriptSchema = z.object({
  video: z.object({
    duration: z.number(),
    fps: z.number().default(30),
    resolution: z.enum(["720p", "1080p", "4k"]),
    aspect: z.enum(["16:9", "9:16", "1:1", "4:3"]),
    purpose: z.enum(["resume", "job_ad", "company_promo", "recruiter_brand", "product_launch", "personal_brand"]).optional(),
    theme: z.object({
      colorPalette: z.array(z.string()),
      fontFamily: z.string(),
      motion: z.enum(["minimal", "moderate", "cinematic"]),
      transition: z.enum(["cut", "fade", "slide", "cinematic-fade"]),
      background: z.enum(["gradient", "dark-tech-grid", "particles", "solid"]),
      customBackground: z.string().optional(),
      customBackgroundType: z.enum(["image", "video"]).optional(),
    }),
    audio: z.object({
      track: z.string(),
      label: z.string(),
      volume: z.number(),
    }).optional(),
  }),
  scenes: z.array(SceneScriptSchema),
  _meta: z.object({ model: z.string().optional() }).optional(),
});

export const StoryboardSceneSchema = z.object({
  duration: z.number(),
  type: z.enum(["intro", "achievement", "skills", "closing", "job-details", "company-culture", "cta", "testimonial", "product-feature", "brand-story", "requirements", "benefits"]),
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
  Exported = "Exported",
  Publishing = "Publishing",
  Completed = "Completed",
  Published = "Published",
  Failed = "Failed",
}

export const StudioProjectSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  status: z.nativeEnum(StudioProjectStatus),
  youtubeVideoId: z.string().nullish(),
  videoUrl: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  storyboard: StoryboardSchema.nullish(),
  script: VideoScriptSchema.nullable().optional(),
  prompt: z.string().nullish(),
  jobDescription: z.string().nullish(),
  resumeText: z.string().nullish(),
  purpose: z.enum(["resume", "job_ad", "company_promo", "recruiter_brand", "product_launch", "personal_brand"]).nullish(),
  viewCount: z.number().optional().default(0),
  ctaClickCount: z.number().optional().default(0),
  isPublic: z.boolean().optional().default(false),
  // Many-to-many subject links via studio_project_subjects (migration 0061).
  // A video can be associated with multiple entities at once (e.g. a
  // personal-brand video linked to a target job AND a resume).
  subjects: z.array(z.object({
    kind: z.enum(["resume", "profile", "job", "company", "skills_demo", "creator_credit"]),
    id:   z.string(),
  })).default([]).optional(),
  creationDateTime: z.string(),
  updateDateTime: z.string(),
});

export type StudioProject = z.infer<typeof StudioProjectSchema>;

export const StudioProjectStatusResponseSchema = z.object({
  id: z.string(),
  status: z.nativeEnum(StudioProjectStatus),
  progressPercentage: z.number(),
  youtubeVideoId: z.string().nullish(),
  videoUrl: z.string().nullish(),
  errorMessage: z.string().nullish(),
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
  title: z.string().nullish(),
  videoUrl: z.string().nullish(),
  youtubeUrl: z.string().nullish(),
  youtubeVideoId: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  privacyStatus: z.string().nullish(),
  status: z.string(),
  createdAt: z.string(),
});
export type ResumeVideo = z.infer<typeof ResumeVideoSchema>;

export const PublicVideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  videoUrl: z.string().nullish(),
  youtubeUrl: z.string().nullish(),
  youtubeVideoId: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  description: z.string().nullish(),
  ownerName: z.string(),
  resumeId: z.string().nullish(),
  createdAt: z.string(),
});
export type PublicVideo = z.infer<typeof PublicVideoSchema>;

export const UserVideoSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  videoUrl: z.string().nullish(),
  youtubeUrl: z.string().nullish(),
  youtubeVideoId: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  description: z.string().nullish(),
  privacyStatus: z.string().nullish(),
  createdAt: z.string(),
});
export type UserVideo = z.infer<typeof UserVideoSchema>;

export type StudioPurpose = "resume" | "job_ad" | "company_promo" | "recruiter_brand" | "product_launch" | "personal_brand";

// ─── Video campaign types ────────────────────────────────────────────────────

export const VideoCampaignSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  utmSource: z.string().nullish(),
  utmMedium: z.string().nullish(),
  utmCampaign: z.string().nullish(),
  status: z.string(),
  videoIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VideoCampaign = z.infer<typeof VideoCampaignSchema>;

export const CampaignStatsSchema = z.object({
  views: z.number(),
  ctaClicks: z.number(),
  shares: z.number(),
  videoCount: z.number(),
});
export type CampaignStats = z.infer<typeof CampaignStatsSchema>;

// ─── Storyboard generation ───────────────────────────────────────────────────

export interface GenerateStoryboardParams {
  resumeText: string;
  resumeId?: string;
  prompt?: string;
  jobDescription?: string;
  // No `model` and no `temperature` here. Both are server-owned via the
  // use-case-driven facade (USE_CASE_PROFILES). End users never pick
  // either — they're product decisions, not knobs.
  targetDuration?: number;
  resolution?: "720p" | "1080p" | "4k";
  motion?: "minimal" | "moderate" | "cinematic";
  purpose?: StudioPurpose;
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
    resolution?: "720p" | "1080p" | "4k",
  ): Promise<ApiSuccessResponse<StudioProject>> {
    const formData = new FormData();
    formData.append("video", blob, "studio-video.webm");
    formData.append("title", title);
    if (projectId) formData.append("projectId", projectId);
    if (resumeId) formData.append("resumeId", resumeId);
    if (resolution) formData.append("resolution", resolution); // gap #133 — 4K Pro gate

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
   * List all studio projects for the current user. When `subject` is
   * provided, only projects linked to that entity are returned —
   * `EntityVideos` uses this to populate the per-entity scroller.
   */
  async getProjects(
    subject?: { kind: string; id: string },
  ): Promise<ApiSuccessResponse<StudioProject[]>> {
    const qs = subject
      ? `?subjectKind=${encodeURIComponent(subject.kind)}&subjectId=${encodeURIComponent(subject.id)}`
      : "";
    return apiClient.get(
      `/api/studio/projects${qs}`,
      z.array(StudioProjectSchema),
    );
  },

  /**
   * Save (create or update) a draft project. Pass `subjects` to
   * replace-all the project's entity links; omit it to leave existing
   * links untouched (e.g. when only the script changed).
   */
  async saveDraft(
    name: string,
    resumeText: string,
    script: import("../../types/video-script").VideoScript | null,
    projectId?: string,
    prompt?: string,
    jobDescription?: string,
    purpose?: StudioPurpose,
    subjects?: Array<{ kind: string; id: string }>,
  ): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.post("/api/studio/save-draft", {
      name,
      resumeText,
      script,
      ...(projectId ? { projectId } : {}),
      ...(prompt ? { prompt } : {}),
      ...(jobDescription ? { jobDescription } : {}),
      ...(purpose ? { purpose } : {}),
      ...(subjects !== undefined ? { subjects } : {}),
    }, StudioProjectSchema);
  },

  /**
   * Add a single entity link to a project. Idempotent — adding the same
   * pair twice is a no-op and still returns the current subjects array.
   */
  async linkSubject(
    projectId: string,
    subject: { kind: string; id: string },
  ): Promise<ApiSuccessResponse<{ projectId: string; subjects: Array<{ kind: string; id: string }> }>> {
    return apiClient.post(
      `/api/studio/projects/${encodeURIComponent(projectId)}/subjects`,
      subject,
    );
  },

  /**
   * Remove a single entity link from a project. Returns 200 + the
   * remaining subjects even when the pair didn't exist (idempotent).
   */
  async unlinkSubject(
    projectId: string,
    subject: { kind: string; id: string },
  ): Promise<ApiSuccessResponse<{ projectId: string; subjects: Array<{ kind: string; id: string }> }>> {
    return apiClient.delete(
      `/api/studio/projects/${encodeURIComponent(projectId)}/subjects/${encodeURIComponent(subject.kind)}/${encodeURIComponent(subject.id)}`,
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

  /**
   * Generate an AI background image for a scene using Cloudflare Workers AI.
   */
  async generateImage(prompt: string): Promise<ApiSuccessResponse<{ imageUrl: string }>> {
    return apiClient.post("/api/studio/generate-image", { prompt }, z.object({ imageUrl: z.string() }));
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
    const form = new FormData();
    form.append("file", file);
    return apiClient.post("/api/upload/single", form, z.object({ url: z.string() }));
  },

  /**
   * Delete a studio project permanently.
   */
  async deleteProject(projectId: string): Promise<ApiSuccessResponse<{ id: string }>> {
    return apiClient.delete(`/api/studio/projects/${projectId}`, z.object({ id: z.string() }));
  },

  /**
   * Clone an existing studio project into a new draft owned by the same user.
   * The backend appends "(Copy)" to the new title and resets status to "Draft".
   */
  async cloneProject(projectId: string): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.post(
      `/api/studio/projects/${projectId}/clone`,
      {},
      StudioProjectSchema,
    );
  },

  /**
   * Update the status of a studio project.
   */
  async updateProjectStatus(
    projectId: string,
    status: "draft" | "exported" | "published" | "processing" | "failed",
  ): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.patch(`/api/studio/projects/${projectId}/status`, { status }, StudioProjectSchema);
  },

  /**
   * Toggle a project's video visibility between public and unlisted.
   */
  async updateProjectVisibility(
    projectId: string,
    isPublic: boolean,
  ): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.patch(
      `/api/studio/projects/${projectId}/visibility`,
      { isPublic },
      StudioProjectSchema,
    );
  },

  /**
   * Get published studio videos for a user (for profile display).
   */
  async getVideosForUser(userId: string): Promise<ApiSuccessResponse<UserVideo[]>> {
    return apiClient.get(`/api/studio/videos/user/${userId}`, z.array(UserVideoSchema));
  },

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
    videoIds?: string[];
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
    videoIds: string[];
  }>): Promise<ApiSuccessResponse<VideoCampaign>> {
    return apiClient.patch(`/api/studio/campaigns/${id}`, data, VideoCampaignSchema);
  },

  async deleteCampaign(id: string): Promise<ApiSuccessResponse<{ archived: boolean }>> {
    return apiClient.delete(`/api/studio/campaigns/${id}`, z.object({ archived: z.boolean() }));
  },

  async getCampaignStats(id: string): Promise<ApiSuccessResponse<CampaignStats>> {
    return apiClient.get(`/api/studio/campaigns/${id}/stats`, CampaignStatsSchema);
  },
};
