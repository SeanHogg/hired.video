// Published-video, campaign, brand-kit, embed and storyboard-request types —
// split out of studio-service.ts (which re-exports everything here).
import { z } from "zod";
import type { StudioPurpose } from "@shared/studio-purposes";

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
