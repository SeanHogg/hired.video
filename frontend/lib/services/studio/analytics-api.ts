// Project view / CTA / watch-heatmap tracking — re-exported by
// studio-features-service.ts.
import { apiClient } from "../../api-client";

// ─── Advanced Analytics ─────────────────────────────────────────────────────
// Re-keyed from videoId → projectId in migration 0085 — analytics are keyed
// on the project (the post-#665 unit of measurement), not the rendered MP4.

export async function trackVideoView(params: {
  projectId: string;
  viewerId?: string;
  viewerEmail?: string;
  secondsWatched: number[];
  totalWatchTimeSec: number;
  percentWatched: number;
  dropOffSecond?: number;
  referrer?: string;
}): Promise<void> {
  await apiClient.post("/api/studio/analytics/track", {
    ...params,
    userAgent: navigator.userAgent,
  });
}

// getVideoAnalytics removed — see header note above the TTS section.

// One-shot view + CTA-click counters keyed on the studio project. The
// heatmap tracker (above) only fires on 30s tick / beforeunload / ended,
// so it under-counts short visits — these endpoints land an authoritative
// row the moment the surface mounts or the hot-zone is clicked. Both
// endpoints accept anonymous (no-auth) callers; the rollup the dashboard
// reads from is /api/studio/projects/:id/analytics. Silent-catch so
// telemetry never breaks the watch page.
export async function recordProjectView(projectId: string, referrer?: string): Promise<void> {
  await apiClient
    .post(`/api/studio/projects/${projectId}/view`, { referrer })
    .catch(() => {});
}

export async function recordProjectCtaClick(projectId: string, opts?: { referrer?: string; targetUrl?: string }): Promise<void> {
  await apiClient
    .post(`/api/studio/projects/${projectId}/cta-click`, {
      referrer: opts?.referrer,
      metadata: opts?.targetUrl ? { targetUrl: opts.targetUrl } : undefined,
    })
    .catch(() => {});
}
