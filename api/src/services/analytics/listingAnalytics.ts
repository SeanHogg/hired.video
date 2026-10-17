/**
 * listingAnalytics.ts — job + company listing reads behind
 * `GET /api/analytics/artifacts/:kind/:id?view=traffic|rollup`.
 *
 *   traffic — 30-day per-view aggregate from artifact_views listing_view
 *             rows (#863; was /api/artifact-metrics/{job,company}/:id)
 *   rollup  — per-job views/sponsored split, applications-by-source and
 *             pipeline funnel (#411; was /api/jobs-analytics/:id)
 *
 * Ownership is enforced by the route (requireJobOwner / requireCompanyOwner)
 * before these run.
 */
import { getDb } from "../../db/index.js";
import {
  ListingViewsRepository,
  type JobAnalyticsRollup,
  type ListingViewMetrics,
} from "../../repositories/listingViewsRepository.js";

export type { JobAnalyticsRollup, ListingViewMetrics };

/** Which read projection of an artifact the caller wants. */
export const ARTIFACT_ANALYTICS_VIEWS = ["engagement", "traffic", "rollup"] as const;
export type ArtifactAnalyticsView = (typeof ARTIFACT_ANALYTICS_VIEWS)[number];

export function parseArtifactAnalyticsView(v: string | undefined): ArtifactAnalyticsView | null {
  if (!v) return "engagement";
  return (ARTIFACT_ANALYTICS_VIEWS as readonly string[]).includes(v) ? (v as ArtifactAnalyticsView) : null;
}

function repo(): ListingViewsRepository {
  return new ListingViewsRepository(getDb());
}

export function getJobTraffic(jobId: string): Promise<ListingViewMetrics> {
  return repo().aggregateJobViews(jobId);
}

export function getCompanyTraffic(companyId: string): Promise<ListingViewMetrics> {
  return repo().aggregateCompanyViews(companyId);
}

export function getJobRollup(jobId: string): Promise<JobAnalyticsRollup> {
  return repo().jobRollup(jobId);
}
