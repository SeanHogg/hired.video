/**
 * Social publishing platforms — the SSoT vocabulary shared by the API,
 * the frontend connection surfaces, and the SuperAdmin managed-accounts
 * surface. PUBLIC (framework-free) data only: ids, labels, which lanes a
 * platform supports, and capability flags.
 *
 * This is the *account-level* platform identity (one OAuth connection per
 * platform). It is distinct from the `PublishDestinationId` in
 * shared/media-kinds.ts, which is a platform+surface *destination* (e.g.
 * youtube vs youtube-shorts both resolve to the `youtube` connection).
 * The destination→platform map is a Phase-2 concern; this file is the
 * connection layer (PRD §5.0).
 *
 * The three connection layers (PRD docs/prd/social-media-publishing-and-distribution.md §5.0):
 *   1. Platform developer app  → Worker Secrets (`*_CLIENT_ID/_SECRET`)   [config]
 *   2. hired.video brand account (Lane A, managed) → `managed_accounts`   [SuperAdmin]
 *   3. End-user account          (Lane B, self)    → `social_connections` [any account; posts count
 *                                                     toward the plan's channel cap — shared/pricing]
 *
 * Backend-only OAuth config (endpoints, scopes per lane, env key names)
 * lives in api/src/services/social/platform-config.ts, keyed by these ids,
 * so the frontend bundle never ships token URLs or secret-key names.
 */

export const SOCIAL_PLATFORMS = [
  "youtube",
  "tiktok",
  "instagram",
  "facebook",
  "linkedin",
  "x",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(v: string): v is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(v);
}

/** Which publishing lane(s) a platform participates in. Most support both;
 *  some (e.g. a managed brand handle that a platform doesn't allow for
 *  third-party posting) may support only one. */
export type SocialLane = "managed" | "self";

export interface SocialPlatformMeta {
  id: SocialPlatform;
  label: string;
  /** Short hint for the icon/skin the UI picks (no asset coupling here). */
  brandKey: string;
  /** Lane A — post via hired.video's brand account (free). */
  supportsManagedLane: boolean;
  /** Lane B — post to the user's own connected account (free, within the
   *  plan's channel cap — `postChannelLimit` in shared/pricing). */
  supportsSelfLane: boolean;
  /** Whether the platform allows programmatic publishing at all today; when
   *  false the publish path uses the download + guided manual-upload
   *  fallback (Phase 2). Connection still works (for identity/analytics). */
  directPublish: boolean;
  /** One-line human note shown in the connect UI (scope/account caveats). */
  connectNote: string;
}

export const SOCIAL_PLATFORM_META: Record<SocialPlatform, SocialPlatformMeta> = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    brandKey: "youtube",
    supportsManagedLane: true,
    supportsSelfLane: true,
    directPublish: true,
    connectNote: "Publishes long-form video and Shorts via the YouTube Data API.",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    brandKey: "tiktok",
    supportsManagedLane: true,
    supportsSelfLane: true,
    directPublish: true,
    connectNote: "Uses the TikTok Content Posting API (Login Kit). Requires app review before posting on your behalf.",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    brandKey: "instagram",
    supportsManagedLane: true,
    supportsSelfLane: true,
    // IG Content Publishing requires a Business/Creator account linked to a
    // Facebook Page + Meta app review; the publisher reports a clear error
    // for personal accounts.
    directPublish: true,
    connectNote: "Reels/Feed publishing needs a Business or Creator account linked to a Facebook Page.",
  },
  facebook: {
    id: "facebook",
    label: "Facebook Page",
    brandKey: "facebook",
    supportsManagedLane: true,
    supportsSelfLane: true,
    directPublish: true,
    connectNote: "Posts to a Facebook Page you manage (not a personal profile).",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    brandKey: "linkedin",
    supportsManagedLane: true,
    supportsSelfLane: true,
    directPublish: true,
    // Lane A (Company Page) needs w_organization_social (Community Mgmt API);
    // Lane B (member feed) needs w_member_social. Different scopes — see
    // platform-config.ts.
    connectNote: "Member feed (your posts) and Company Page (brand) use different LinkedIn permissions.",
  },
  x: {
    id: "x",
    label: "X (Twitter)",
    brandKey: "x",
    supportsManagedLane: true,
    supportsSelfLane: true,
    directPublish: true,
    connectNote: "Requires a paid X API tier. Uses OAuth 2.0 with PKCE.",
  },
};

export function socialPlatformMeta(id: SocialPlatform): SocialPlatformMeta {
  return SOCIAL_PLATFORM_META[id];
}

// ─── Lane availability (the gate state the UI renders) ───────────────────────
//
// Computed once on the server (resolveLaneAvailability) and mirrored to the
// client via GET /api/social/platforms, so the lane chooser self-gates from
// ONE source — never a prop-drilled `canPublishToX` boolean (DRY rule).

/** Lane B (self) availability for a given user+platform. */
export type SelfLaneState =
  | "available"        // connected → can publish to own account
  | "needs_connection" // app configured, no fresh connection → show connect prompt
  | "not_configured"   // developer app secret missing (layer 1) → hide the channel
  | "unsupported";     // platform has no self lane

/** Lane A (managed) availability for a given platform (user-independent). */
export type ManagedLaneState =
  | "ready"            // app configured + brand account connected → free lane live
  | "not_configured"   // developer app secret missing (layer 1) — ops task
  | "not_connected"    // app configured but no brand account (layer 2) — SA task
  | "unsupported";     // platform has no managed lane

export interface PlatformLaneAvailability {
  platform: SocialPlatform;
  /** Lane A — post via hired.video (free). `ready` means layers 1+2 satisfied. */
  managed: ManagedLaneState;
  /** Lane B — post to your own account (Pro-gated). */
  self: SelfLaneState;
  /** Convenience: the user currently has a fresh self-connection. */
  selfConnected: boolean;
}

// ─── Video posting through the generic social publisher ──────────────────────
//
// Platforms whose connections live in `social_connections` (server-side
// OAuth, encrypted tokens). Each id is ALSO a `PublishDestinationId`
// (shared/media-kinds), so a post records one publication row under the
// same id.

export const SOCIAL_POST_PLATFORMS = ["tiktok", "instagram", "x", "facebook", "linkedin"] as const;

export type SocialPostPlatform = (typeof SOCIAL_POST_PLATFORMS)[number];

export function isSocialPostPlatform(v: string): v is SocialPostPlatform {
  return (SOCIAL_POST_PLATFORMS as readonly string[]).includes(v);
}

/** LinkedIn's post-commentary limit — the API adapter clips to it and the
 *  Post dock's shared caption box caps at it. */
export const LINKEDIN_POST_TEXT_MAX = 3000;

// ─── Every network a rendered video can be posted to (Lane B) ────────────────
//
// The ONE social publish route (POST /api/studio/projects/:id/publish/social/
// :platform) and the publisher registry (api/src/services/social/publishers)
// are keyed by this list. YouTube is a member like every other network; only
// its token store differs (`youtube_accounts`, connected through
// /api/youtube), which the API's token source hides behind the seam.

export const VIDEO_PUBLISH_PLATFORMS = ["youtube", ...SOCIAL_POST_PLATFORMS] as const;

export type VideoPublishPlatform = (typeof VIDEO_PUBLISH_PLATFORMS)[number];

export function isVideoPublishPlatform(v: string): v is VideoPublishPlatform {
  return (VIDEO_PUBLISH_PLATFORMS as readonly string[]).includes(v);
}

/** The longest post text / description each network accepts — what its
 *  adapter clips to, and what the AI caption writer aims under. */
export const POST_TEXT_LIMITS: Record<VideoPublishPlatform, number> = {
  youtube: 5000,
  tiktok: 2200,
  instagram: 2200,
  x: 280,
  facebook: 5000,
  linkedin: LINKEDIN_POST_TEXT_MAX,
};

/** The tightest text limit across the networks one caption goes to (the
 *  Post dock writes ONE caption for every picked channel). */
export function sharedPostTextLimit(platforms: readonly VideoPublishPlatform[]): number {
  return platforms.reduce((min, p) => Math.min(min, POST_TEXT_LIMITS[p]), LINKEDIN_POST_TEXT_MAX);
}
