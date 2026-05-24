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
  "video",
  "resume",
  "article",
  "job",
  "profile",
  "company",
  "studio_template",
  "service",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** Engagement unit: 's' for time-based artifacts (video, audio) where the
 *  `engagement[]` array is one bucket per second; '%' for static artifacts
 *  (resume, article, profile, …) where there are 100 fixed buckets for
 *  scroll-depth. The shared MetricsPanel reads this to label its heatmap
 *  axis correctly. */
export type EngagementUnit = "s" | "%";

/** Default engagement unit for each artifact kind. Time-based formats
 *  bucket by second; static formats bucket by scroll-percent. */
export function engagementUnitFor(kind: ArtifactKind): EngagementUnit {
  return kind === "video" ? "s" : "%";
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
