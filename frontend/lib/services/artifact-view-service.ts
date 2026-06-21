/**
 * artifact-view-service.ts — frontend wire for the polymorphic
 * artifact_views beacon and the kind-aware analytics endpoint.
 *
 * Two public functions:
 *   sendArtifactViewBeacon(beacon)
 *     POST /api/analytics/artifacts/beacon — fire-and-forget, called
 *     from the per-artifact trackers (scroll-tracker, video-tracker).
 *
 *   fetchArtifactAnalytics(kind, id)
 *     GET /api/analytics/artifacts/:kind/:id — returns the projected
 *     ArtifactMetrics shape the shared <MetricsPanel> consumes.
 *
 * See README "Consolidated Gap Register" #1019 for the L1/L2/L3 build.
 */

import { apiClient, resolveApiUrl } from "../api-client";
import type { ArtifactKind, ArtifactViewBeacon } from "@shared/artifact-views";
import type { ArtifactMetrics } from "@/components/analytics";

export async function sendArtifactViewBeacon(
  beacon: ArtifactViewBeacon,
): Promise<void> {
  // navigator.sendBeacon would be the right fit for pagehide / beforeunload
  // since fetch is best-effort there. Fall back to fetch (keepalive) when
  // sendBeacon is unavailable. apiClient.post lacks the keepalive flag, so
  // we go direct to fetch for the unload path.
  //
  // Must use the absolute API origin — the Pages worker on hired.video does
  // not own /api/* (that's the api.hired.video Hono worker), so a relative
  // path 405s in prod. resolveApiUrl also de-dupes the `/api` that the
  // localhost base (http://localhost:8787/api) already carries.
  const body = JSON.stringify(beacon);
  const url = resolveApiUrl("/api/analytics/artifacts/beacon");
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    } catch {}
  }
  await apiClient.post("/api/analytics/artifacts/beacon", beacon);
}

export async function fetchArtifactAnalytics(
  kind: ArtifactKind,
  artifactId: string,
): Promise<ArtifactMetrics | null> {
  const res = await apiClient.get<ArtifactMetrics>(
    `/api/analytics/artifacts/${kind}/${encodeURIComponent(artifactId)}`,
  );
  return res.data ?? null;
}

export interface CreatorArtifactRow {
  artifactKind: ArtifactKind;
  artifactId: string;
  title: string;
  thumbnail: string | null;
  totalViews: number;
  uniqueViewers: number;
  avgPercentConsumed: number;
  lastViewedAt: string | null;
}

export interface CreatorRollup {
  totals: {
    totalViews: number;
    uniqueViewers: number;
    countriesReached: number;
    artifactCount: number;
  };
  countries: Array<{ country: string; views: number }>;
  referrers: Array<{ source: string; views: number }>;
  artifacts: CreatorArtifactRow[];
}

export async function fetchCreatorRollup(): Promise<CreatorRollup | null> {
  const res = await apiClient.get<CreatorRollup>("/api/analytics/creator/me");
  return res.data ?? null;
}
