/**
 * studio-analytics-events.ts — single source of truth for the
 * studio playback event taxonomy (stored in artifact_views.event_type via
 * STUDIO_EVENT_TO_VIEW_EVENT_TYPE in shared/artifact-views.ts; was the
 * `video_analytics.event` column until W3-A 0580).
 *
 * The stored event_type IS CHECK-constrained (artifact_views_event_type_check,
 * built from ARTIFACT_VIEW_EVENT_TYPES) — a new studio event adds an entry
 * here AND a mapping in STUDIO_EVENT_TO_VIEW_EVENT_TYPE (+ a migration that
 * widens the CHECK).
 *
 * Producers:
 *   - Frontend `<StudioPlayer/>` tracker → `view`
 *   - Frontend CTA-click tracker → `cta_click`
 *   - Frontend share button → `share`
 *   - Backend ad-network webhook ingestion → `impression` (#1137)
 *
 * Consumers:
 *   - `buildArtifactMetrics()` in `api/src/services/analytics/artifactAnalytics.ts`
 *   - Per-campaign rollup in `getCampaignStats()`
 *
 * Per the DRY rule: adding a new event type is one entry here; producer
 * + consumer types both narrow from this enum.
 */

export const STUDIO_ANALYTICS_EVENTS = [
  /** In-platform player started or scroll-tracker registered a view. */
  "view",
  /** Off-platform ad-network reported a paid-media impression
   *  (GDN / Meta Ads / TikTok Ads / programmatic). One row per
   *  network-reported impression, posted via webhook or CSV upload. */
  "impression",
  /** Viewer clicked a CTA widget on the rendered artifact. */
  "cta_click",
  /** Viewer used the share button on the artifact's player surface. */
  "share",
] as const;

export type StudioAnalyticsEvent = (typeof STUDIO_ANALYTICS_EVENTS)[number];

export function isStudioAnalyticsEvent(value: unknown): value is StudioAnalyticsEvent {
  return (
    typeof value === "string" &&
    (STUDIO_ANALYTICS_EVENTS as readonly string[]).includes(value)
  );
}
