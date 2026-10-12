/**
 * Recorded clip → a durable URL, or a failure the UI must handle (#563).
 *
 * The one rule: a `blob:` (or `data:`) URL never reaches saved studio state.
 * A blob URL dies with the tab, so a clip saved with one is gone after a
 * reload or on another device. The recorder keeps the clip in memory and
 * offers Retry / Download instead of dropping a blob URL onto the canvas.
 */
import { uploadRecording } from "@/lib/services/studio-features-service";
import type { RecordingMode } from "@/lib/studio/recording-modes";
import { isEphemeralMediaUrl } from "@/lib/studio/media-persistence";

export type RecordingUploader = typeof uploadRecording;

export type PersistRecordingResult =
  | { ok: true; url: string; recordingId: string }
  | { ok: false; reason: "no_url" | "error"; message?: string };

/** The upload file for a MediaRecorder blob (mp4 on Safari, webm elsewhere). */
export function recordingFileFromBlob(blob: Blob, now: number = Date.now()): File {
  const type = blob.type || "video/webm";
  const ext = type.includes("mp4") ? "mp4" : "webm";
  return new File([blob], `recording-${now}.${ext}`, { type });
}

export async function persistRecording(
  blob: Blob,
  opts: { mode: RecordingMode; projectId?: string; durationMs: number },
  upload: RecordingUploader = uploadRecording,
): Promise<PersistRecordingResult> {
  try {
    const { id, videoUrl } = await upload(recordingFileFromBlob(blob), opts.mode, opts.projectId, opts.durationMs);
    if (!videoUrl || isEphemeralMediaUrl(videoUrl)) return { ok: false, reason: "no_url" };
    return { ok: true, url: videoUrl, recordingId: id };
  } catch (err) {
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : undefined };
  }
}
