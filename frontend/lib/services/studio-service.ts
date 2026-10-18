/**
 * Studio service facade. The implementation lives in per-area modules under
 * `./studio/` (schemas, projects, generation, page embeds, uploads,
 * publishing, videos, campaigns + brand kits); this file keeps the original
 * import path, export names and the single `studioService` object so every
 * call site and `vi.mock("@/lib/services/studio-service")` keeps working.
 */
import { studioGenerationApi } from "./studio/generation-api";
import { studioPageEmbedsApi } from "./studio/page-embeds-api";
import { studioUploadsApi } from "./studio/uploads-api";
import { studioPublishingApi } from "./studio/publishing-api";
import { studioProjectsApi } from "./studio/projects-api";
import { studioVideosApi } from "./studio/videos-api";
import { studioCampaignsApi } from "./studio/campaigns-api";

export type { VideoScript, SceneScript } from "../../types/video-script";
// Re-exported from shared/studio-purposes.ts — that file is the
// single source of truth for the storyboard-generator purpose enum.
export type { StudioPurpose } from "@shared/studio-purposes";

export {
  SceneScriptSchema,
  VideoScriptSchema,
  StoryboardSceneSchema,
  StoryboardSchema,
  type StoryboardScene,
  type Storyboard,
} from "./studio/script-schemas";

export {
  StudioProjectStatus,
  StudioProjectSchema,
  StudioPublicationSchema,
  type StudioProject,
  type StudioPublication,
} from "./studio/project-schemas";

export {
  ResumeVideoSchema,
  PublicVideoSchema,
  UserVideoSchema,
  VideoCampaignSchema,
  CampaignStatsSchema,
  StudioBrandKitSchema,
  StudioVideoEmbedSchema,
  StudioVideoEventCountsSchema,
  type ResumeVideo,
  type PublicVideo,
  type ResolvedPageEmbed,
  type PageEmbedListItem,
  type UserVideo,
  type VideoCampaign,
  type CampaignStats,
  type StudioBrandKit,
  type StudioBrandKitInput,
  type StudioVideoEmbed,
  type StudioVideoEventCounts,
  type GenerateStoryboardParams,
} from "./studio/video-schemas";

export { deduplicatePublications } from "./studio/publishing-api";

// ─── Service ──────────────────────────────────────────────────────────────────
// One object, as before. Methods in studioProjectsApi that call `this.*`
// (findDocumentProject → findSubjectProject → getProjects, saveVideoDraft →
// saveDraft) resolve `this` to this facade at call time.

export const studioService = {
  ...studioGenerationApi,
  ...studioPageEmbedsApi,
  ...studioUploadsApi,
  ...studioPublishingApi,
  ...studioProjectsApi,
  ...studioVideosApi,
  ...studioCampaignsApi,
};
