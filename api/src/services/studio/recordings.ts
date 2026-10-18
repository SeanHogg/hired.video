/**
 * Webcam / screen recording use cases (upload, delete, transcription save)
 * and their delivery-coaching results. Owns the storage side effects, the
 * project-link gate (#2391) and the pitch cache bust (#2133); SQL lives in
 * repositories/studioRecordingsRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import { cdnUrl } from "../../utils/cdn.js";
import { deleteR2Keys } from "../storage/r2-delete.js";
import { putObject } from "../storage/object-store.js";
import { onPitchTakeChanged } from "../pitch/pitchService.js";
import { withRecordingProjectAccess } from "./recordingProjectAccess.js";
import {
  deleteOwnedRecording,
  findLatestDeliveryCoaching,
  findOwnedRecording,
  insertDeliveryCoaching,
  insertRecording,
  setRecordingTranscription,
  type DeliveryCoachingInsert,
  type DeliveryCoachingRow,
  type StudioRecordingRow,
} from "../../repositories/studioRecordingsRepository.js";

const recordingNotFound = () => new DomainError(404, "NOT_FOUND", "Recording not found");

/** Best-effort: a cache bust failure must not fail the recording write. */
async function bustPitchCachesForTake(projectId: string | null): Promise<void> {
  await onPitchTakeChanged(projectId).catch((err) =>
    logger.warn("[studio/recording] pitch cache invalidation failed", { error: err instanceof Error ? err.message : err }),
  );
}

export interface RecordingUploadInput {
  file: { name: string; type: string; size: number };
  bytes: ArrayBuffer;
  type: string;
  durationMs: number;
  /** The raw `projectId` form value (normalised by the access gate). */
  rawProjectId: unknown;
}

/** Store the take and its row. Linking it to a project needs write access to
 *  that project (owner / company member / delegate, #2391) — checked BEFORE
 *  any blob or row is written; refused → 404 "Project not found". */
export async function uploadRecording(
  userId: string,
  input: RecordingUploadInput,
): Promise<{ id: string; videoUrl: string | null }> {
  const { file, bytes } = input;
  const gated = await withRecordingProjectAccess(userId, input.rawProjectId, async (projectId) => {
    let videoUrl: string | null = null;
    const videoKey = `studio/recordings/${userId}/${Date.now()}-${file.name || "recording.webm"}`;
    // The project hint links the uploaded_assets row to its studio project
    // (#733) — metadata only; the FK nulls itself if the project goes away.
    if (await putObject(videoKey, bytes, file.type || "video/webm", undefined, { sourceProjectId: projectId })) {
      videoUrl = cdnUrl(videoKey);
    }

    const recording = await insertRecording(getDb(), {
      userId,
      projectId,
      type: input.type,
      videoUrl,
      videoKey,
      durationMs: input.durationMs,
      metadata: { contentType: file.type, size: file.size },
    });
    // A new take on a current pitch project IS the new pitch video (#2133) —
    // bust the caches that embed it (partner payload).
    if (videoUrl) await bustPitchCachesForTake(projectId);
    return { id: recording.id, videoUrl };
  });
  if (!gated.ok) throw new DomainError(404, "NOT_FOUND", "Project not found");
  return gated.value;
}

/** Owner removes a recording (DB row + R2 blob). */
export async function deleteRecording(userId: string, recordingId: string): Promise<void> {
  const deleted = await deleteOwnedRecording(getDb(), recordingId, userId);
  if (!deleted) throw recordingNotFound();
  await deleteR2Keys([deleted.videoKey]);
  // Deleting the newest take of a current pitch changes the shown video.
  await bustPitchCachesForTake(deleted.projectId);
}

/** The caller's recording, or 404. */
export async function getOwnedRecording(userId: string, recordingId: string): Promise<StudioRecordingRow> {
  const recording = await findOwnedRecording(getDb(), recordingId, userId);
  if (!recording) throw recordingNotFound();
  return recording;
}

export function saveRecordingTranscription(recordingId: string, text: string, words: unknown): Promise<void> {
  return setRecordingTranscription(getDb(), recordingId, text, words);
}

export function saveDeliveryCoaching(values: DeliveryCoachingInsert): Promise<DeliveryCoachingRow> {
  return insertDeliveryCoaching(getDb(), values);
}

/** The newest coaching result the caller has for a recording, or null. */
export function getLatestDeliveryCoaching(userId: string, recordingId: string): Promise<DeliveryCoachingRow | null> {
  return findLatestDeliveryCoaching(getDb(), recordingId, userId);
}
