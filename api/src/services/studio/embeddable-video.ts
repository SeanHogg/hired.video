/**
 * Keyless video embed resolution (#1860) — a studio project id → its rendered,
 * publicly-embeddable video. Returns null when the project is missing, private,
 * or not yet rendered (an external iframe can't run the live canvas renderer).
 */
import { getDb } from "../../db/index.js";
import { findEmbedVideoByProjectId } from "../../repositories/studioPublicWatchRepository.js";
import { cdnUrl } from "../../utils/cdn.js";

export interface EmbeddableVideo {
  title: string;
  videoUrl: string | null;
  youtubeVideoId: string | null;
  thumbnailUrl: string | null;
}

export async function resolveEmbeddableVideo(projectId: string): Promise<EmbeddableVideo | null> {
  const row = await findEmbedVideoByProjectId(getDb(), projectId);
  if (!row) return null;
  if (row.privacyStatus === "private") return null;
  const videoUrl = row.r2Key ? cdnUrl(row.r2Key) : null;
  if (!videoUrl && !row.youtubeVideoId) return null; // not rendered yet
  return {
    title: row.title ?? "Video",
    videoUrl,
    youtubeVideoId: row.youtubeVideoId ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
  };
}
