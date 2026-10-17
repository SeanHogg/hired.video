/**
 * artifact-views.ts — shared type vocabulary for the polymorphic
 * artifact_views table (migration 0107). Frontend beacons, the backend
 * insert path, the per-kind analytics endpoint, and the creator-rollup
 * endpoint all key off this enum so a new artifact type wires up in
 * exactly one place.
 *
 * See README "Consolidated Gap Register" #1019 for the five-layer build
 * that introduced this surface.
 */

import { STUDIO_ANALYTICS_EVENTS, type StudioAnalyticsEvent } from "./studio-analytics-events.js";

export const ARTIFACT_KINDS = [
  // ─── Studio-project mediaKinds (mirror @shared/media-kinds.ts) ──────────
  // Every value here maps 1:1 to a `MediaKind` from shared/media-kinds.ts.
  // All studio kinds key on `studio_projects.id`, share the same owner
  // lookup, and write to the same `videoAnalytics` event table (studio_
  // project_id FK is kind-agnostic). The kind only affects: (1) the
  // engagement unit ('s' for time-based playback, '%' for static
  // rasters), (2) the MetricsPanel copy mapping ("Avg Watch Time" vs
  // "Avg View Time"), (3) which export pipelines fire impression beacons.
  //
  // Per the DRY rule: this list is the SSoT for which studio kinds have
  // analytics. Adding a new studio MediaKind ALSO adds an ArtifactKind
  // entry here; the analytics endpoint + the owner lookup + the
  // MetricsPanel copy table all pick it up.
  "video",
  "podcast",
  "voice",
  "animation",
  "game",
  "comic",
  "interactive_comic",
  "image",
  "cad",
  "cad_3d",
  "document",
  // ─── Non-studio artifacts (own entity tables) ───────────────────────────
  "resume",
  "article",
  "job",
  "profile",
  "company",
  "studio_template",
  "service",
  // Social feed post — keys on feed_posts.id; '%'-unit single-shot
  // impressions with viewer + geography rollup (no heatmap).
  "post",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export function isArtifactKind(value: unknown): value is ArtifactKind {
  return typeof value === "string" && (ARTIFACT_KINDS as readonly string[]).includes(value);
}

/** Whether the artifact kind is a `studio_projects.id`-keyed row. ONE
 *  predicate consumed by the analytics owner-lookup, the impression
 *  router, and the export-pipeline UTM-bake gate — adding a new studio
 *  mediaKind to ARTIFACT_KINDS gets picked up automatically. */
export function isStudioArtifactKind(kind: ArtifactKind): boolean {
  return (
    kind === "video" ||
    kind === "podcast" ||
    kind === "voice" ||
    kind === "animation" ||
    kind === "game" ||
    kind === "comic" ||
    kind === "image" ||
    kind === "cad" ||
    kind === "document"
  );
}

/** Engagement unit: 's' for time-based artifacts (video, podcast, voice,
 *  animation, scrollable resume/article) where the `engagement[]` array
 *  is one bucket per second; '%' for static artifacts (image banners,
 *  comics, games, OG cards, profiles, jobs, …) where there are 100
 *  fixed buckets for scroll-depth or single-shot view counts. The shared
 *  MetricsPanel reads this to label its heatmap axis correctly. */
export type EngagementUnit = "s" | "%";

/** Default engagement unit for each artifact kind. Time-based formats
 *  bucket by second; static formats bucket by scroll-percent. */
export function engagementUnitFor(kind: ArtifactKind): EngagementUnit {
  // Time-based: video playback, podcast/voice audio scrubbing, animation
  // frame loops, scrollable text (resume/article). Everything else is a
  // single-shot impression unit with optional scroll-depth.
  if (
    kind === "video" ||
    kind === "podcast" ||
    kind === "voice" ||
    kind === "animation"
  ) {
    return "s";
  }
  return "%";
}

/** Wire shape the frontend scroll-tracker / video-tracker beacons emit.
 *  Server populates ip_country from CF-IPCountry, ip_hash from the IP
 *  itself + daily salt, and owner_user_id from the artifact lookup —
 *  these are NOT trusted from the client. */
export interface ArtifactViewBeacon {
  artifactKind: ArtifactKind;
  artifactId: string;
  /** Per-second (video) or per-percent-scrolled (static) bucket array. */
  engagement?: number[];
  totalEngagementSec?: number;
  /** 0..1 — fraction of duration watched (video) or page scrolled (static). */
  percentConsumed?: number;
  /** Index into `engagement` where the viewer dropped off / closed. */
  dropOffBucket?: number | null;
  viewerEmail?: string | null;
  viewerCompany?: string | null;
  referrer?: string | null;
}

// ─── Event streams in artifact_views (W3-A, migration 0580) ──────────────────
//
// artifact_views is the ONE polymorphic view/engagement table. The retired
// per-feature tables (resume_views, company_views, job_view_events,
// company_view_events, video_analytics) were folded into it; `event_type`
// keeps their streams apart so no reader double-counts:
//
//   view          — an artifact view: client scroll/watch beacons (engagement
//                   set) and server-recorded page loads (engagement NULL —
//                   the former resume_views / company_views rows). Every
//                   pre-0580 artifact_views row.
//   listing_view  — job / company listing traffic with acquisition `source`
//                   + `region` (was job_view_events / company_view_events);
//                   retention-swept at 180 days.
//   player_view   — studio player start (was video_analytics event='view').
//   impression    — off-platform paid-media impression (video_analytics).
//   cta_click     — CTA widget click (video_analytics).
//   share         — player share button (video_analytics).
//
// The DB CHECK `artifact_views_event_type_check` is built from this list.
export const ARTIFACT_VIEW_EVENT_TYPES = [
  "view",
  "listing_view",
  "player_view",
  "impression",
  "cta_click",
  "share",
] as const;

export type ArtifactViewEventType = (typeof ARTIFACT_VIEW_EVENT_TYPES)[number];

/** Studio playback events (shared/studio-analytics-events.ts) that live in
 *  artifact_views, keyed by their studio event name. The studio `view`
 *  event is stored as `player_view` so it never mixes with artifact views. */
export const STUDIO_EVENT_TO_VIEW_EVENT_TYPE = {
  view: "player_view",
  impression: "impression",
  cta_click: "cta_click",
  share: "share",
} as const satisfies Record<StudioAnalyticsEvent, ArtifactViewEventType>;

/** Reverse of STUDIO_EVENT_TO_VIEW_EVENT_TYPE — the studio event name for a
 *  stored event_type, or null when the row is not a studio playback event. */
export function studioEventForViewEventType(eventType: string): StudioAnalyticsEvent | null {
  for (const studioEvent of STUDIO_ANALYTICS_EVENTS) {
    if (STUDIO_EVENT_TO_VIEW_EVENT_TYPE[studioEvent] === eventType) return studioEvent;
  }
  return null;
}
