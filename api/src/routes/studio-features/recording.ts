/**
 * Studio features — webcam recording + transcription. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 * Use cases live in services/studio/recordings.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import {
  deleteRecording,
  getOwnedRecording,
  saveRecordingTranscription,
  uploadRecording,
} from "../../services/studio/recordings.js";
import { transcribeAudio } from "../../services/adapters/transcription.js";
import { logger } from "../../lib/logger.js";
import { parseUpload, isUploadRejected } from "../../utils/multipart.js";
import { success, error } from "../../types/index.js";

export const recordingRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  4. WEBCAM RECORDING + TRANSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/recording/upload — upload a webcam/screen recording
recordingRoutes.post("/recording/upload", async (c) => {
  const user = c.var.user;
  const up = await parseUpload(c, { fields: ["video"], messages: { missing: "Missing video file" } });
  if (isUploadRejected(up)) return c.json(error("VALIDATION_ERROR", up.form ? up.message : "Invalid form data"), 400);
  const { form, file, bytes } = up;
  const type = String(form.get("type") ?? "webcam");
  const durationMs = Number(form.get("durationMs") ?? 0);

  const saved = await uploadRecording(user.sub, {
    file,
    bytes,
    type,
    durationMs,
    rawProjectId: form.get("projectId"),
  });

  return c.json(success({
    id: saved.id,
    videoUrl: saved.videoUrl,
    type,
    durationMs,
  }), 201);
});

// DELETE /api/studio/recording/:id — owner removes a recording (DB row + R2 blob)
recordingRoutes.delete("/recording/:id", async (c) => {
  const recordingId = c.req.param("id");
  await deleteRecording(c.var.user.sub, recordingId);
  return c.json(success({ id: recordingId }));
});

// POST /api/studio/recording/:id/transcribe — transcribe a recording using Whisper
recordingRoutes.post("/recording/:id/transcribe", async (c) => {
  const user = c.var.user;
  const recordingId = c.req.param("id");
  const openaiKey = c.env.OPENAI_API_KEY;
  if (!openaiKey) return c.json(error("TRANSCRIPTION_UNAVAILABLE", "OpenAI API key not configured"), 503);

  await getOwnedRecording(user.sub, recordingId);

  // For now, we expect the frontend to send the audio directly
  const up = await parseUpload(c, { fields: ["audio"], messages: { missing: "Missing audio file" } });
  if (isUploadRejected(up)) return c.json(error("VALIDATION_ERROR", up.message), 400);
  const { file: audioFile, bytes: audioBuffer } = up;

  try {
    const result = await transcribeAudio(openaiKey, audioBuffer, audioFile.name || "audio.webm", {
      meter: { user, featureKey: "studio_recording_transcribe" },
    });

    await saveRecordingTranscription(recordingId, result.text, result.words);

    return c.json(success({
      text: result.text,
      language: result.language,
      durationSec: result.durationSec,
      words: result.words,
    }));
  } catch (err) {
    logger.error("[recording/transcribe] error", err);
    return c.json(error("TRANSCRIPTION_FAILED", `Transcription failed: ${err}`), 500);
  }
});
