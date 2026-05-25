/**
 * ArtifactMetrics — wire-shape every artifact's analytics endpoint
 * (video, resume, article, job posting, profile, …) projects into
 * before handing off to <MetricsPanel/>. One panel, many sources.
 *
 * Optional sections (`heatmap`, `viewers`, `referrers`, `countries`,
 * `ctaClicks`, `avgWatchSec`, `avgPercentWatched`) self-gate inside the
 * panel — anything missing is silently dropped from the render so a
 * resume's metrics view doesn't have to fake a video heatmap, etc.
 *
 * Adapters that translate per-artifact endpoint shapes into this type
 * live next to their source service (e.g. studio-features-service.ts
 * for the video adapter). See README "Consolidated Gap Register" for
 * the per-artifact rollout status.
 */

export interface ArtifactViewer {
  id: string;
  email?: string;
  company?: string;
  lastViewed: string;
  views: number;
  /** 0–100. Optional — only artifact types with a duration (videos,
   *  scrollable resumes/articles with scroll-depth tracking) populate
   *  this. Static artifacts (job posts) leave it undefined. */
  avgPercent?: number;
}

export interface ArtifactReferrer {
  source: string;
  views: number;
}

export interface ArtifactCountry {
  /** ISO-3166 alpha-2, uppercased. "ZZ" = unknown bucket. */
  country: string;
  views: number;
}

export interface ArtifactMetrics {
  /** Total view events. Always present (even if zero). */
  totalViews: number;

  /** CTA clicks; omitted when the artifact has no embedded CTAs. */
  ctaClicks?: number;
  /** 0..1. Pair with `ctaClicks` — omit when CTAs aren't applicable. */
  ctaClickThroughRate?: number;

  /** Time-based engagement (videos, audio, scroll-time). Both omitted
   *  for static artifacts. */
  avgWatchSec?: number;
  avgPercentWatched?: number;

  /** Per-second/percent engagement buckets, 0–100 each. Length =
   *  duration in seconds (videos) or 100 (percent-scrolled buckets).
   *  Omit to hide the heatmap card. */
  heatmap?: number[];
  /** Index into `heatmap` where the highest drop-off occurs. */
  topDropOffSecond?: number | null;
  /** Unit shown in the heatmap axis label. Defaults to "s". */
  heatmapUnit?: "s" | "%";

  viewers?: ArtifactViewer[];
  referrers?: ArtifactReferrer[];
  countries?: ArtifactCountry[];
}

/** Kind label drives the "X viewers" copy and the duration unit shown
 *  in the empty/heatmap states. Optional metadata — the panel renders
 *  fine without it.
 *
 *  Mirrors `ArtifactKind` from `@shared/artifact-views` for the kinds
 *  that produce distinct copy. Kinds without distinct labelling fall
 *  through to "channel" via `metricsPanelKind()` in the dashboard. */
export type ArtifactKind =
  // Time-based studio playback — read/watch time + percent-watched copy.
  | "video"
  | "podcast"
  | "voice"
  | "animation"
  // Static studio rasters / interactive — percent-viewed copy.
  | "image"
  | "comic"
  | "game"
  | "cad"
  // Non-studio scrollable text — "read time" copy.
  | "resume"
  | "article"
  // Non-studio static records — no time label.
  | "job"
  | "profile"
  // Fallback bucket for company / studio_template / service.
  | "channel";
