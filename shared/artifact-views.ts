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
  "image",
  "cad",
  // ─── Non-studio artifacts (own entity tables) ───────────────────────────
  "resume",
  "article",
  "job",
  "profile",
  "company",
  "studio_template",
  "service",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

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
    kind === "cad"
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
