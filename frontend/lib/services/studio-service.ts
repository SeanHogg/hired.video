import { z } from "zod";
import { apiClient } from "../api-client";
import { uploadFile } from "./upload-service";
import type { ApiSuccessResponse } from "@shared/api";
import { STUDIO_PURPOSES, type StudioPurpose } from "@shared/studio-purposes";
import { SCENE_TYPES } from "@shared/scene-types";
import { MEDIA_KINDS, type MediaKind } from "@shared/media-kinds";
import { STUDIO_SUBJECT_KINDS, type StudioSubject } from "@shared/studio-subject";
import type { VideoPublishPlatform } from "@shared/social-platforms";
import type { TikTokCreatorInfo, TikTokPostSettings } from "@shared/tiktok-post-settings";
import type { VideoScript } from "../../types/video-script";
import { canvasStateToTimeline } from "../studio/editor-v2/timeline-emit";
import type { CanvasState } from "../studio/editor-v2/canvas-state";

export type { VideoScript };
export type { SceneScript } from "../../types/video-script";

const studioPurposeSchema = z.enum(STUDIO_PURPOSES);

// ─── VideoScript Zod schema (mirrors the TypeScript type) ────────────────────
// Used only for API response validation — the authoritative types live in
// frontend/types/video-script.ts.

const AnimationSpecSchema = z.object({
  type: z.enum(["fadeIn", "slideUp", "slideIn", "scaleIn", "typewriter", "none"]),
  start: z.number(),
  duration: z.number(),
  easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "spring"]).optional(),
});

// SceneEffect lives on `SceneScript.effects`. New writes use the
// `{kind, params}` shape (matches the shared effect registry); legacy
// rows used `{type, intensity}` and are migrated on parse so every
// downstream consumer sees the canonical shape. Single source of
// truth for the on-disk shape — every persistence path routes here.
const SceneEffectSchema = z
  .union([
    z.object({ kind: z.string(), params: z.record(z.string(), z.unknown()).default({}) }),
    z.object({
      type: z.enum(["particles", "blur", "glow", "vignette"]),
      intensity: z.number(),
    }),
  ])
  .transform((raw) => {
    if ("kind" in raw) return { kind: raw.kind, params: raw.params ?? {} };
    return { kind: raw.type, params: { intensity: raw.intensity } };
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

const MotionPhaseSchema = z.object({
  kind: z.enum(["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down", "scale", "pulse"]),
  durationSeconds: z.number(),
  easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]),
});

const BaseElementFields = {
  id: z.string(),
  box: ElementBoxSchema,
  style: ElementStyleSchema,
  z: z.number().optional(),
  rotation: z.number().optional(),
  appearAt: z.number().optional(),
  motion: z.object({ enter: MotionPhaseSchema, exit: MotionPhaseSchema }).optional(),
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
  type: z.enum(SCENE_TYPES),
  label: z.string().optional(),
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
  backgroundEffect: z.string().optional(),
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
    purpose: studioPurposeSchema.optional(),
    // Render preset (Slice C). Optional with sensible defaults — older
    // rows that don't carry these fields still parse and render via
    // the WebCodecs h264/aac fast path.
    codec: z.enum(["h264", "h265", "prores", "dnxhd", "vp9"]).optional(),
    container: z.enum(["mp4", "mov", "webm"]).optional(),
    audioCodec: z.enum(["aac", "pcm", "opus"]).optional(),
    videoBitrate: z.number().optional(),
    audioBitrate: z.number().optional(),
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
  type: z.enum(SCENE_TYPES),
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
  // 'scene' = legacy template editor (storyboard/script). 'nle' = power-user
  // multi-track timeline editor (timelineSpec). See migration 0067 +
  // shared/timeline.ts. Default 'scene' so any pre-0067 row still routes
  // to the scene editor without explicit migration.
  kind: z.enum(["scene", "nle"]).default("scene").optional(),
  // Output axis (#894) — what the finished project becomes. Drives the
  // export menu, publish destinations, and per-template "Exports as
  // MP4 / MP3+RSS / GIF" panel. See `@shared/media-kinds`. Default
  // 'video' for every pre-#894 row.
  mediaKind: z.enum(MEDIA_KINDS).default("video").optional(),
  // Frame-accurate Timeline JSON for kind='nle' projects. The shape is
  // validated client-side by callers that consume it (the NLE canvas);
  // server stores verbatim. See shared/timeline.ts.
  timelineSpec: z.unknown().nullish(),
  // Game runtime state for mediaKind='game' projects (#927). Parallel
  // to `timelineSpec` — each canvas runtime owns its own JSONB column
  // per the canvas-runtime extensibility model (PRD §1.2). Validated
  // client-side by `<GameStage>`; server stores verbatim. See
  // shared/game-state.ts.
  gameState: z.unknown().nullish(),
  // Image runtime state for mediaKind='image' projects (#932). Same
  // parallel-column pattern as gameState. Validated client-side by
  // <DrawingStage>; server stores verbatim. See shared/image-state.ts.
  imageState: z.unknown().nullish(),
  // Animation runtime state for mediaKind='animation' projects (#1003).
  // Same parallel-column pattern. Validated client-side by
  // <AnimationStage>; server stores verbatim. See
  // shared/animation-state.ts.
  animationState: z.unknown().nullish(),
  // CAD runtime state for mediaKind='cad' projects (#930). Same
  // parallel-column pattern. Validated client-side by <CadStage>;
  // server stores verbatim. See shared/cad-state.ts.
  cadState: z.unknown().nullish(),
  // 3D CAD runtime state for mediaKind='cad_3d' projects (#930 Phase 2).
  // Validated client-side by <Cad3DStage>; server stores verbatim. See
  // shared/cad-3d-state.ts.
  cad3dState: z.unknown().nullish(),
  // Comic runtime state for mediaKind='comic' projects (#929 / #1217).
  // Dormant today (comic authoring rides the CanvasState path) but
  // mirrored on the DTO + schema so the per-kind parallel-column
  // pattern is total. Removes the foot-gun where a future comic-only
  // field silently round-trips to nothing.
  comicState: z.unknown().nullish(),
  // Interactive-comic (Comic+) branching choice graph for
  // mediaKind='interactive_comic' projects (#1960 / #2126). Validated
  // client-side by <InteractiveComicStage>; server stores verbatim. See
  // shared/interactive-comic-state.ts.
  interactiveComicState: z.unknown().nullish(),
  // Document runtime state for mediaKind='document' projects (#1912).
  // Same parallel-column pattern. Validated client-side by <DocumentStage>;
  // server stores verbatim. See document-state.ts.
  documentState: z.unknown().nullish(),
  prompt: z.string().nullish(),
  jobDescription: z.string().nullish(),
  resumeText: z.string().nullish(),
  purpose: studioPurposeSchema.nullish(),
  viewCount: z.number().optional().default(0),
  ctaClickCount: z.number().optional().default(0),
  // Distinct channels the project is published to — filled by the LIST read
  // (GET /api/studio/projects, one grouped query); 0 elsewhere.
  publicationCount: z.number().int().nonnegative().optional().default(0),
  isPublic: z.boolean().optional().default(false),
  // SEO metadata — editable via the editor "Details" drawer. Persisted
  // server-side inside the storyboard JSONB (no migration); see
  // toProjectDto in api/src/routes/studio.ts.
  metaDescription: z.string().nullish(),
  slug: z.string().nullish(),
  keywords: z.array(z.string()).default([]).optional(),
  socialCardImage: z.string().nullish(),
  // Many-to-many subject links via studio_project_subjects (migration 0061).
  // A video can be associated with multiple entities at once (e.g. a
  // personal-brand video linked to a target job AND a resume).
  subjects: z.array(z.object({
    kind: z.enum(STUDIO_SUBJECT_KINDS),
    id:   z.string(),
  })).default([]).optional(),
  creationDateTime: z.string(),
  updateDateTime: z.string(),
  // Content revision (#2242): bumped by every save-draft. An autosave sends
  // the revision it was based on; a stale one is refused with 409.
  revision: z.number().int().nonnegative().optional(),
});

export type StudioProject = z.infer<typeof StudioProjectSchema>;

// ─── Publication records (#1920) ────────────────────────────────────────────
// "Where has this project been published?" — one record per destination,
// mirroring the api `PublicationRecord` (publication-service.ts). `destination`
// is a shared `PublishDestinationId`; `externalUrl` is the view/preview link
// (YouTube watch URL, LinkedIn post, on-platform /m/ link).

export const StudioPublicationSchema = z.object({
  id: z.string().optional(),
  destination: z.string(),
  externalId: z.string().nullish(),
  externalUrl: z.string().nullish(),
  status: z.enum(["published", "failed", "pending"]),
  publishedAt: z.string(),
  updatedAt: z.string(),
  /** Fitted cut posted; null/absent = the master. */
  renderVariantId: z.string().nullish(),
});
export type StudioPublication = z.infer<typeof StudioPublicationSchema>;


// ─── Published video types ───────────────────────────────────────────────────

// mediaKind + parallel-runtime state shared across every video-typed
// response shape (#1215). Spread into Resume / Public / User schemas
// below so the four legacy `/videos/*` endpoints all carry enough
// information for `<ProjectPlayer>` to dispatch per kind on each
// rail consumer (resume detail / profile / homepage hero / featured).
// Per the DRY rule, the schemas can't drift on which kinds they carry.
const MediaKindFields = {
  mediaKind: z.string().nullish(),
  timelineSpec: z.unknown().nullish(),
  gameState: z.unknown().nullish(),
  imageState: z.unknown().nullish(),
  animationState: z.unknown().nullish(),
  cadState: z.unknown().nullish(),
  comicState: z.unknown().nullish(),
  documentState: z.unknown().nullish(),
} as const;

export const ResumeVideoSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  videoUrl: z.string().nullish(),
  youtubeUrl: z.string().nullish(),
  youtubeVideoId: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  privacyStatus: z.string().nullish(),
  status: z.string(),
  isProfilePrimary: z.boolean().nullish(),
  ...MediaKindFields,
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
  isFeatured: z.boolean().nullish(),
  /** The owner's user id (public profile link) — on the discovery feed. */
  ownerId: z.string().nullish(),
  ownerName: z.string(),
  /** The owner's profile headline ("CIO · Waukesha, WI") — discovery feed. */
  ownerHeadline: z.string().nullish(),
  resumeId: z.string().nullish(),
  /** The theme the video wore when posted (discovery feed). */
  themeId: z.string().nullish(),
  /** What the person is looking for: fullTime · contract · fractional · next. */
  goal: z.string().nullish(),
  ...MediaKindFields,
  createdAt: z.string(),
});
export type PublicVideo = z.infer<typeof PublicVideoSchema>;

/** A page→video embed resolved for a route (#1860). The server projects
 *  the published Studio project into the `PublicVideo` shape the player
 *  renders directly. */
export interface ResolvedPageEmbed {
  placement: "hero" | "inline" | string;
  video: PublicVideo;
}

/** One row in the SuperAdmin page-embed management list. */
export interface PageEmbedListItem {
  pathname: string;
  placement: string;
  isActive: boolean;
  projectId: string;
  rendered: boolean;
  title: string;
  updatedAt: string;
}

export const UserVideoSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  videoUrl: z.string().nullish(),
  youtubeUrl: z.string().nullish(),
  youtubeVideoId: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  description: z.string().nullish(),
  privacyStatus: z.string().nullish(),
  ...MediaKindFields,
  // Which profile surfaces this video should appear on for the owner —
  // computed server-side against (studio_project_subjects.subject_kind,
  // subject_id). Includes `"profile"` when the project is linked to
  // this user's profile, `"resume"` when linked to one of their resumes.
  // Empty for portfolio / creator-credit / unrelated subject kinds.
  subjectKinds: z.array(z.string()).nullish(),
  createdAt: z.string(),
});
export type UserVideo = z.infer<typeof UserVideoSchema>;

// Re-exported from shared/studio-purposes.ts — that file is the
// single source of truth for the storyboard-generator purpose enum.
export type { StudioPurpose };

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
  projectIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VideoCampaign = z.infer<typeof VideoCampaignSchema>;

export const CampaignStatsSchema = z.object({
  views: z.number(),
  ctaClicks: z.number(),
  shares: z.number(),
  projectCount: z.number(),
});
export type CampaignStats = z.infer<typeof CampaignStatsSchema>;

// ─── Brand kits — Studio (separate from `whitelabelTenants` / pitch-deck brand kits) ──

export const StudioBrandKitSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyId: z.string().nullish(),
  name: z.string(),
  logoUrl: z.string().nullish(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  accentColor: z.string(),
  fontFamily: z.string(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StudioBrandKit = z.infer<typeof StudioBrandKitSchema>;

export interface StudioBrandKitInput {
  name?: string;
  logoUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  isDefault?: boolean;
}

// ─── Video embed + per-video event counts ──────────────────────────────────

export const StudioVideoEmbedSchema = z.object({
  embedHtml: z.string(),
  shareUrl: z.string(),
  videoUrl: z.string(),
  width: z.number(),
  height: z.number(),
});
export type StudioVideoEmbed = z.infer<typeof StudioVideoEmbedSchema>;

export const StudioVideoEventCountsSchema = z.object({
  projectId: z.string(),
  views: z.number(),
  ctaClicks: z.number(),
  shares: z.number(),
  clickThroughRate: z.number(),
});
export type StudioVideoEventCounts = z.infer<typeof StudioVideoEventCountsSchema>;

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
  /** Optional studio brand kit — when set the storyboard endpoint injects
   *  the kit's colours / logo / font into the generated VideoScript. */
  brandKitId?: string | null;
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
   * Generate a 6-page pitch comic from the user's intake fields.
   * Single source of truth for the comic AI scaffolder; mounted by the
   * comic template intake form's Generate button and by any external
   * "Re-roll the comic" affordance that ships later. Returns the
   * server's `GenerateComicResponse` envelope so the caller can show
   * which artefact the scaffolder used ("Used your resume", "Used your
   * profile", …).
   */
  async generateComic(params: {
    prompt: string;
    genreId?: string;
    protagonistName?: string;
    sourceKind?: "resume" | "profile" | "services" | "auto";
    resumeId?: string;
  }): Promise<ApiSuccessResponse<import("@shared/comic-spec").GenerateComicResponse>> {
    return apiClient.post(
      "/api/studio/generate-comic",
      params,
    ) as Promise<ApiSuccessResponse<import("@shared/comic-spec").GenerateComicResponse>>;
  },

  /**
   * SuperAdmin page → video scaffolder (#1860). Posts a harvested page
   * (DOM text + images + CTAs + the route's PAGE_SEO copy) and gets back
   * a `PageVideoSpec` the editor hydrates into a CanvasState. Gated to
   * SuperAdmin server-side; the calling tool is hidden from non-SA users.
   */
  async generatePageVideo(
    page: import("@shared/page-video-spec").HarvestedPage,
  ): Promise<ApiSuccessResponse<import("@shared/page-video-spec").GeneratePageVideoResponse>> {
    return apiClient.post("/api/studio/generate-from-page", { page }) as Promise<
      ApiSuccessResponse<import("@shared/page-video-spec").GeneratePageVideoResponse>
    >;
  },

  // ── Page → video embed registry (#1860) ──────────────────────────────────

  /**
   * Resolve the video a SuperAdmin published to a marketing-page route, or
   * null. PUBLIC — the shared <MarketingPageVideo> component calls this on
   * every page for anonymous visitors too.
   */
  async resolvePageEmbed(
    pathname: string,
  ): Promise<ApiSuccessResponse<{ embed: ResolvedPageEmbed | null }>> {
    return apiClient.get(
      `/api/studio/page-embeds/resolve?path=${encodeURIComponent(pathname)}`,
    ) as Promise<ApiSuccessResponse<{ embed: ResolvedPageEmbed | null }>>;
  },

  /** PUBLIC: the set of routes that currently carry an embed. Fetched once
   *  + cached so <MarketingPageVideo> only runs the full resolve on a hit
   *  (#1863). */
  async listActivePageEmbedPaths(): Promise<ApiSuccessResponse<{ paths: string[] }>> {
    return apiClient.get("/api/studio/page-embeds/paths") as Promise<
      ApiSuccessResponse<{ paths: string[] }>
    >;
  },

  /** SuperAdmin: publish a Studio project onto a page route (upsert). */
  async setPageEmbed(args: {
    pathname: string;
    projectId: string;
    placement?: "hero" | "inline";
  }): Promise<ApiSuccessResponse<{ pathname: string; placement: string }>> {
    return apiClient.post("/api/studio/page-embeds", args) as Promise<
      ApiSuccessResponse<{ pathname: string; placement: string }>
    >;
  },

  /** SuperAdmin: unpublish a page route's video. */
  async removePageEmbed(
    pathname: string,
  ): Promise<ApiSuccessResponse<{ pathname: string; removed: boolean }>> {
    return apiClient.delete(
      `/api/studio/page-embeds?path=${encodeURIComponent(pathname)}`,
    ) as Promise<ApiSuccessResponse<{ pathname: string; removed: boolean }>>;
  },

  /** SuperAdmin: list every active page→video mapping. */
  async listPageEmbeds(): Promise<ApiSuccessResponse<{ embeds: PageEmbedListItem[] }>> {
    return apiClient.get("/api/studio/page-embeds") as Promise<
      ApiSuccessResponse<{ embeds: PageEmbedListItem[] }>
    >;
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
   * Post the project's rendered video to the caller's own YouTube channel,
   * TikTok, Instagram, X, Facebook Page or LinkedIn account (one route for
   * every network). The project must already be rendered; the editor calls
   * this after ensureRendered(). The server checks the plan's channel cap and
   * records the publication. Throws with `context.serverCode` =
   * "SOCIAL_NOT_CONNECTED" (connect again) or "PRO_REQUIRED" (cap reached).
   */
  async publishToSocial(
    projectId: string,
    platform: VideoPublishPlatform,
    request: {
      title: string;
      caption: string;
      tiktok?: TikTokPostSettings;
      youtube?: { privacy: "public" | "private" | "unlisted"; tags?: string[]; shorts?: boolean };
      /** A fitted cut of this project to post instead of the master (#2045). */
      variantVideoId?: string;
    },
  ): Promise<ApiSuccessResponse<{ publication: StudioPublication }>> {
    return apiClient.post(
      `/api/studio/projects/${projectId}/publish/social/${platform}`,
      request,
      z.object({ publication: StudioPublicationSchema }),
    );
  },

  /**
   * The caller's TikTok account state for the Post dock's TikTok settings
   * (read fresh each time the form opens — TikTok's sharing guidelines).
   * Throws with `context.serverCode` = "SOCIAL_NOT_CONNECTED" when the
   * connection is gone.
   */
  async getTikTokCreatorInfo(): Promise<TikTokCreatorInfo> {
    const res = (await apiClient.get("/api/studio/social/tiktok/creator-info")) as ApiSuccessResponse<{
      creator: TikTokCreatorInfo;
    }>;
    return res.data.creator;
  },

  /**
   * List the destinations a project has been published to (one per
   * destination, with view URLs). Drives the editor's "Published to" surfaces.
   *
   * When the project has multiple cuts (variants) published to the same
   * destination, returns only the latest one per network — the UI shows
   * one chip per network, not per cut.
   */
  async getPublications(
    projectId: string,
  ): Promise<ApiSuccessResponse<StudioPublication[]>> {
    const res = await apiClient.get(
      `/api/studio/projects/${projectId}/publications`,
      z.array(StudioPublicationSchema),
    );
    // Deduplicate by destination, keeping the latest (by publishedAt)
    const deduped = deduplicatePublications(res.data);
    return { ...res, data: deduped };
  },

  /**
   * List all studio projects for the current user. When `subject` is
   * provided, only projects linked to that entity are returned —
   * `EntityMedia` uses this to populate the per-entity scroller.
   * When `workspace` is provided (e.g. "personal" | "company:<id>" |
   * "delegated:<id>"), the response is restricted to that workspace
   * scope; omit it to receive rows from every workspace the caller can
   * see. Build the value via `selectionToQuery()` so the encoding
   * stays in lockstep with the server-side parser.
   */
  async getProjects(
    subject?: { kind: string; id: string },
    workspace?: string,
  ): Promise<ApiSuccessResponse<StudioProject[]>> {
    const params = new URLSearchParams();
    if (subject) {
      params.set("subjectKind", subject.kind);
      params.set("subjectId", subject.id);
    }
    if (workspace) params.set("workspace", workspace);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get(
      `/api/studio/projects${qs}`,
      z.array(StudioProjectSchema),
    );
  },

  /**
   * Public read for the EntityMedia rail (#323). Returns the projects
   * linked to the given subject that the owner has marked public,
   * regardless of who the viewer is — including anonymous viewers on
   * public listing pages. Owners should keep using `getProjects` so they
   * see their drafts and analytics; non-owners use this so they only
   * receive watchable public clips.
   */
  async getPublicProjects(
    subject: { kind: string; id: string },
  ): Promise<ApiSuccessResponse<StudioProject[]>> {
    const params = new URLSearchParams({
      subjectKind: subject.kind,
      subjectId: subject.id,
    });
    return apiClient.get(
      `/api/studio/public?${params.toString()}`,
      z.array(StudioProjectSchema),
    );
  },

  /**
   * Resolve the canvas `document`-kind project linked to a subject, if one
   * exists yet (#1882). A resume / article / blog authored on the document
   * canvas has exactly one such project; this is the single seam for "find
   * the existing canvas doc" so the studio-landing redirect and the entity
   * "Edit" buttons stay in lockstep. Returns null on first-ever edit (no doc
   * project yet) or on any fetch error, so callers fall back to the
   * `?editResume=`/`?editArticle=` bootstrap that mints one.
   */
  async findDocumentProject(
    subject: { kind: string; id: string },
  ): Promise<StudioProject | null> {
    return this.findSubjectProject(subject, "document");
  },

  /**
   * The newest project of `mediaKind` linked to a subject, or null (none
   * yet, or the fetch failed). The ONE seam for "is there already a <kind>
   * for this entity?" — the document canvas uses it for résumé/article docs.
   */
  async findSubjectProject(
    subject: { kind: string; id: string },
    mediaKind: MediaKind,
  ): Promise<StudioProject | null> {
    try {
      return await this.findSubjectProjectStrict(subject, mediaKind);
    } catch {
      return null;
    }
  },

  /**
   * findSubjectProject that THROWS when the lookup fails, so a caller about
   * to create the project on "none found" (a career kit's ONE video) never
   * mistakes a 401 / network blip for "none" and saves a duplicate.
   */
  async findSubjectProjectStrict(
    subject: { kind: string; id: string },
    mediaKind: MediaKind,
  ): Promise<StudioProject | null> {
    const res = await this.getProjects(subject);
    const matches = (res.data ?? []).filter((p) => p.mediaKind === mediaKind);
    matches.sort((a, b) => b.updateDateTime.localeCompare(a.updateDateTime));
    return matches[0] ?? null;
  },

  /** Save a video canvas as an NLE draft (create, or update `projectId`). */
  async saveVideoDraft(args: {
    name: string;
    projectId?: string;
    canvas: CanvasState | null;
    subjects?: StudioSubject[];
  }) {
    return this.saveDraft({
      name: args.name,
      projectId: args.projectId,
      kind: "nle",
      mediaKind: "video",
      ...(args.canvas ? { timelineSpec: canvasStateToTimeline(args.canvas) } : {}),
      ...(args.subjects ? { subjects: args.subjects } : {}),
    });
  },

  /**
   * Save (create or update) a draft project. Pass `subjects` to
   * replace-all the project's entity links; omit it to leave existing
   * links untouched (e.g. when only the title changed). Pass
   * `timelineSpec` (with `kind: 'nle'`) when saving from the v2 canvas
   * editor. No caller writes a V1 `script` any more (#639); old V1 rows
   * are converted at read time (`scriptToCanvasState`).
   */
  async saveDraft(
    args: {
      name: string;
      resumeText?: string;
      projectId?: string;
      prompt?: string;
      jobDescription?: string;
      purpose?: StudioPurpose;
      subjects?: Array<{ kind: string; id: string }>;
      kind?: "scene" | "nle";
      /** Output axis (#894). Sent on first save when the user picked a
       *  non-video template — server defaults to 'video' so legacy
       *  callers are unaffected. */
      mediaKind?: MediaKind;
      timelineSpec?: unknown;
      /** Game runtime state for mediaKind='game' projects (#927). Sent
       *  by `<GameStage>` on save; mutually exclusive in practice with
       *  `timelineSpec` (each canvas runtime writes to its own JSONB
       *  column). See `shared/game-state.ts`. */
      gameState?: unknown;
      /** Image runtime state for mediaKind='image' projects (#932). Sent
       *  by `<DrawingStage>` on save; same parallel-column pattern as
       *  `gameState`. See `shared/image-state.ts`. */
      imageState?: unknown;
      /** Animation runtime state for mediaKind='animation' projects
       *  (#1003). Sent by `<AnimationStage>` on save; same parallel-
       *  column pattern. See `shared/animation-state.ts`. */
      animationState?: unknown;
      /** CAD runtime state for mediaKind='cad' projects (#930). Sent
       *  by `<CadStage>` on save; same parallel-column pattern. See
       *  `shared/cad-state.ts`. */
      cadState?: unknown;
      /** 3D CAD runtime state for mediaKind='cad_3d' projects (#930
       *  Phase 2). Sent by `<Cad3DStage>` on save; same parallel-column
       *  pattern. See `shared/cad-3d-state.ts`. */
      cad3dState?: unknown;
      /** Document runtime state for mediaKind='document' projects (#1912).
       *  Sent by `<DocumentStage>` on save; same parallel-column pattern. */
      documentState?: unknown;
      /** Interactive-comic (Comic+) branching choice graph for
       *  mediaKind='interactive_comic' projects (#1960 / #2126). Sent by
       *  `<InteractiveComicStage>` on save; same parallel-column pattern.
       *  See `shared/interactive-comic-state.ts`. */
      interactiveComicState?: unknown;
      // SEO patch — sent only by the "Details" drawer; omit-vs-empty
      // matters server-side (omitted = preserve, empty string = clear).
      metaDescription?: string;
      slug?: string;
      keywords?: string[];
      socialCardImage?: string;
      /** The revision this save is based on (#2242). When set, the server
       *  refuses the write with 409 STALE_REVISION if another tab/device has
       *  saved since. Omit to overwrite (manual save, "keep mine"). */
      baseRevision?: number;
    },
  ): Promise<ApiSuccessResponse<StudioProject>> {
    const body = {
      name: args.name,
      resumeText: args.resumeText ?? "",
      ...(args.projectId ? { projectId: args.projectId } : {}),
      ...(args.prompt ? { prompt: args.prompt } : {}),
      ...(args.jobDescription ? { jobDescription: args.jobDescription } : {}),
      ...(args.purpose ? { purpose: args.purpose } : {}),
      ...(args.subjects !== undefined ? { subjects: args.subjects } : {}),
      ...(args.kind ? { kind: args.kind } : {}),
      ...(args.mediaKind ? { mediaKind: args.mediaKind } : {}),
      ...(args.timelineSpec !== undefined ? { timelineSpec: args.timelineSpec } : {}),
      ...(args.gameState !== undefined ? { gameState: args.gameState } : {}),
      ...(args.imageState !== undefined ? { imageState: args.imageState } : {}),
      ...(args.animationState !== undefined ? { animationState: args.animationState } : {}),
      ...(args.cadState !== undefined ? { cadState: args.cadState } : {}),
      ...(args.cad3dState !== undefined ? { cad3dState: args.cad3dState } : {}),
      ...(args.documentState !== undefined ? { documentState: args.documentState } : {}),
      ...(args.interactiveComicState !== undefined ? { interactiveComicState: args.interactiveComicState } : {}),
      ...(args.metaDescription !== undefined ? { metaDescription: args.metaDescription } : {}),
      ...(args.slug !== undefined ? { slug: args.slug } : {}),
      ...(args.keywords !== undefined ? { keywords: args.keywords } : {}),
      ...(args.socialCardImage !== undefined ? { socialCardImage: args.socialCardImage } : {}),
      ...(args.baseRevision !== undefined ? { baseRevision: args.baseRevision } : {}),
    };
    // A versioned save is an autosave: a 409 STALE_REVISION is an expected
    // outcome the editor handles (it asks which copy to keep), not an error
    // for the global toast.
    return apiClient.request(
      "/api/studio/save-draft",
      { method: "POST", body, suppressErrorEvent: args.baseRevision !== undefined },
      StudioProjectSchema,
    );
  },

  /**
   * Single-project hydration. Server-side ownership check returns 404
   * when the caller can't read (parity with the GET /projects list).
   */
  async getProject(projectId: string): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.get(
      `/api/studio/projects/${encodeURIComponent(projectId)}`,
      StudioProjectSchema,
    );
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
   * Generate an AI image via Cloudflare Workers AI. Two modes:
   *   • text→image (default) — pass just the prompt
   *   • image→image — pass `sourceImageUrl` to rewrite an existing image
   *     under the prompt. Powers "update this element" across studios.
   * `strength` (0..1) is denoise strength for img2img only; ignored in
   * text→image mode. Defaults to 0.8 server-side.
   */
  async generateImage(
    prompt: string,
    opts?: {
      sourceImageUrl?: string;
      sourceImageDataUrl?: string;
      strength?: number;
    },
  ): Promise<ApiSuccessResponse<{ imageUrl: string; mode?: "img2img" | "text2img" }>> {
    return apiClient.post(
      "/api/studio/images",
      {
        mode: "generate",
        prompt,
        ...(opts?.sourceImageUrl ? { sourceImageUrl: opts.sourceImageUrl } : {}),
        ...(opts?.sourceImageDataUrl && !opts?.sourceImageUrl
          ? { sourceImageDataUrl: opts.sourceImageDataUrl }
          : {}),
        ...(typeof opts?.strength === "number" ? { strength: opts.strength } : {}),
      },
      z.object({
        imageUrl: z.string(),
        mode: z.enum(["img2img", "text2img"]).optional(),
      }),
    );
  },

  /**
   * Mask-aware AI inpaint (#1109). Takes a source image + binary mask
   * (white = inpaint inside, black = preserve outside) + prompt; the
   * SDXL-inpainting model regenerates content only inside the mask
   * with surrounding context informing the new pixels. Produces visually
   * cleaner stitches than the client-side `compositeImageIntoSelection`
   * fallback. Caller is responsible for rasterising the user's marquee
   * selection into a binary mask dataURL the same size as the source.
   */
  async inpaintImage(
    prompt: string,
    sourceImageDataUrl: string,
    maskImageDataUrl: string,
    opts?: { strength?: number },
  ): Promise<ApiSuccessResponse<{ imageUrl: string; mode?: "inpaint" }>> {
    return apiClient.post(
      "/api/studio/images",
      {
        mode: "inpaint",
        prompt,
        sourceImageDataUrl,
        maskImageDataUrl,
        ...(typeof opts?.strength === "number" ? { strength: opts.strength } : {}),
      },
      z.object({
        imageUrl: z.string(),
        mode: z.enum(["inpaint"]).optional(),
      }),
    );
  },

  /** Canvas-expanding AI outpaint (#940). Same model pool as inpaint;
   *  the route adds expansion deltas + builds the outer mask
   *  server-side. The client passes the source image data URL + the
   *  per-edge expansion in pixels. */
  async outpaintImage(
    prompt: string,
    sourceImageDataUrl: string,
    expand: { top: number; right: number; bottom: number; left: number },
    opts?: { strength?: number },
  ): Promise<ApiSuccessResponse<{
    imageUrl: string;
    mode?: "outpaint";
    expand: { top: number; right: number; bottom: number; left: number };
  }>> {
    return apiClient.post(
      "/api/studio/images",
      {
        mode: "outpaint",
        prompt,
        sourceImageDataUrl,
        expandTop: expand.top,
        expandRight: expand.right,
        expandBottom: expand.bottom,
        expandLeft: expand.left,
        ...(typeof opts?.strength === "number" ? { strength: opts.strength } : {}),
      },
      z.object({
        imageUrl: z.string(),
        mode: z.enum(["outpaint"]).optional(),
        expand: z.object({
          top: z.number(),
          right: z.number(),
          bottom: z.number(),
          left: z.number(),
        }),
      }),
    );
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
    return apiClient.patch(`/api/studio/projects/${projectId}`, { status }, StudioProjectSchema);
  },

  /**
   * Toggle a project's video visibility between public and unlisted.
   */
  async updateProjectVisibility(
    projectId: string,
    isPublic: boolean,
  ): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.patch(
      `/api/studio/projects/${projectId}`,
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

/**
 * Deduplicate publications by destination, keeping the latest one (by publishedAt).
 * Used when the UI needs one chip per network rather than one per variant.
 */
export function deduplicatePublications(
  publications: StudioPublication[],
): StudioPublication[] {
  const byDestination = new Map<string, StudioPublication>();
  for (const pub of publications) {
    const existing = byDestination.get(pub.destination);
    if (!existing) {
      byDestination.set(pub.destination, pub);
      continue;
    }
    // Keep the one with the latest publishedAt
    const existingTime = new Date(existing.publishedAt).getTime();
    const newTime = new Date(pub.publishedAt).getTime();
    if (newTime > existingTime) {
      byDestination.set(pub.destination, pub);
    }
  }
  return Array.from(byDestination.values());
}
