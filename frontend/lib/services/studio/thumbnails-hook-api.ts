// AI thumbnails (gap #142), public engagement assets (#1586) and the AI hook
// optimizer (gap #143) — re-exported by studio-features-service.ts.
import { apiClient } from "../../api-client";
import type {
  HookOptimizerResult,
  PublicEngagementAssets,
  ThumbnailCandidate,
} from "./engagement-types";

// ─── AI Thumbnails (gap #142) ───────────────────────────────────────────────

export async function scoreThumbnails(projectId: string, candidates: Array<{
  imageUrl: string;
  storageKey?: string;
  sourceTimeSec?: number;
}>, headlineHint?: string): Promise<ThumbnailCandidate[]> {
  const res = await apiClient.post<{ candidates: ThumbnailCandidate[] }>(
    `/api/studio/projects/${projectId}/thumbnails/score`,
    { candidates, headlineHint },
  );
  return res.data.candidates;
}

/** Optional-auth: works for signed-out viewers. 404 (throws) for a private,
 *  unknown or malformed project id — silently: a playback surface showing a
 *  not-yet-public project just renders no engagement controls. */
export async function getPublicEngagementAssets(projectId: string): Promise<PublicEngagementAssets> {
  const res = await apiClient.get<PublicEngagementAssets>(
    `/api/studio/projects/${encodeURIComponent(projectId)}/engagement/public`,
    undefined,
    { suppressErrorEvent: true },
  );
  return res.data;
}

export async function listThumbnails(projectId: string): Promise<ThumbnailCandidate[]> {
  const res = await apiClient.get<{ thumbnails: ThumbnailCandidate[] }>(
    `/api/studio/projects/${projectId}/thumbnails`,
  );
  return res.data.thumbnails;
}

export async function selectThumbnail(projectId: string, thumbnailId: string): Promise<ThumbnailCandidate> {
  const res = await apiClient.patch<ThumbnailCandidate>(
    `/api/studio/projects/${projectId}/thumbnail`,
    { thumbnailId },
  );
  return res.data;
}

// ─── AI Hook Optimizer (gap #143) ───────────────────────────────────────────

export async function optimizeHook(params: {
  projectId: string;
  storyboard: unknown;
  videoId?: string;
}): Promise<HookOptimizerResult> {
  const { projectId, ...body } = params;
  const res = await apiClient.post<HookOptimizerResult>(
    `/api/studio/projects/${projectId}/hook/optimize`,
    body,
  );
  return res.data;
}
