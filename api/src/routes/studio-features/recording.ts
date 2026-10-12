/**
 * Studio features — webcam recording + transcription. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { onPitchTakeChanged } from "../../services/pitch/pitchService.js";
import { withRecordingProjectAccess } from "../../services/studio/recordingProjectAccess.js";
import { transcribeAudio } from "../../services/adapters/transcription.js";
import { cdnUrl } from "../../utils/cdn.js";
import { deleteR2Keys } from "../../services/storage/r2-delete.js";
import { putObject } from "../../services/storage/object-store.js";
import { ok, fail, studioRecordings } from "./shared.js";

export const recordingRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  4. WEBCAM RECORDING + TRANSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════════

/** Best-effort: a cache bust failure must not fail the recording write. */
async function bustPitchCachesForTake(projectId: string | null): Promise<void> {
  await onPitchTakeChanged(projectId).catch((err) =>
    console.warn("[studio/recording] pitch cache invalidation failed:", err instanceof Error ? err.message : err),
  );
}

// POST /api/studio/recording/upload — upload a webcam/screen recording
recordingRoutes.post("/recording/upload", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json(fail("VALIDATION_ERROR", "Invalid form data"), 400);

  const file = form.get("video") as File | null;
  const type = String(form.get("type") ?? "webcam");
  const durationMs = Number(form.get("durationMs") ?? 0);

  if (!file) return c.json(fail("VALIDATION_ERROR", "Missing video file"), 400);

  // Linking a take to a project needs write access to it (owner / company
  // member / delegate, #2391) — checked BEFORE any blob or row is written.
  const gated = await withRecordingProjectAccess(user.sub, form.get("projectId"), async (projectId) => {
    const db = getDb();
    let videoUrl: string | null = null;
    const bytes = await file.arrayBuffer();
    const videoKey = `studio/recordings/${user.sub}/${Date.now()}-${file.name || "recording.webm"}`;
    // The project hint links the uploaded_assets row to its studio project
    // (#733) — metadata only; the FK nulls itself if the project goes away.
    if (await putObject(videoKey, bytes, file.type || "video/webm", undefined, { sourceProjectId: projectId })) {
      videoUrl = cdnUrl(videoKey);
    }

    const [recording] = await db.insert(studioRecordings).values({
      userId: user.sub,
      projectId,
      type,
      videoUrl,
      videoKey,
      durationMs,
      metadata: { contentType: file.type, size: file.size },
    } as any).returning();
    // A new take on a current pitch project IS the new pitch video (#2133) —
    // bust the caches that embed it (partner payload).
    if (videoUrl) await bustPitchCachesForTake(projectId);
    return { id: recording.id as string, videoUrl };
  });
  if (!gated.ok) return c.json(fail("NOT_FOUND", "Project not found"), 404);

  return c.json(ok({
    id: gated.value.id,
    videoUrl: gated.value.videoUrl,
    type,
    durationMs,
  }), 201);
});

// DELETE /api/studio/recording/:id — owner removes a recording (DB row + R2 blob)
recordingRoutes.delete("/recording/:id", async (c) => {
  const user = c.var.user;
  const recordingId = c.req.param("id");
  const db = getDb();

  const [deleted] = await db.delete(studioRecordings)
    .where(and(eq(studioRecordings.id, recordingId), eq(studioRecordings.userId, user.sub)))
    .returning();

  if (!deleted) return c.json(fail("NOT_FOUND", "Recording not found"), 404);
  await deleteR2Keys([deleted.videoKey]);
  // Deleting the newest take of a current pitch changes the shown video.
  await bustPitchCachesForTake(deleted.projectId);
  return c.json(ok({ id: recordingId }));
});

// POST /api/studio/recording/:id/transcribe — transcribe a recording using Whisper
recordingRoutes.post("/recording/:id/transcribe", async (c) => {
  const user = c.var.user;
  const recordingId = c.req.param("id");
  const openaiKey = c.env.OPENAI_API_KEY;
  if (!openaiKey) return c.json(fail("TRANSCRIPTION_UNAVAILABLE", "OpenAI API key not configured"), 503);

  const db = getDb();
  const [recording] = await db.select().from(studioRecordings)
    .where(and(eq(studioRecordings.id, recordingId), eq(studioRecordings.userId, user.sub)))
    .limit(1);

  if (!recording) return c.json(fail("NOT_FOUND", "Recording not found"), 404);

  // For now, we expect the frontend to send the audio directly
  const form = await c.req.formData().catch(() => null);
  const audioFile = form?.get("audio") as File | null;
  if (!audioFile) return c.json(fail("VALIDATION_ERROR", "Missing audio file"), 400);

  try {
    const audioBuffer = await audioFile.arrayBuffer();
    const result = await transcribeAudio(openaiKey, audioBuffer, audioFile.name || "audio.webm");

    await db.update(studioRecordings).set({
      transcription: result.text,
      wordTimestamps: result.words,
    } as any).where(eq(studioRecordings.id, recordingId));

    return c.json(ok({
      text: result.text,
      language: result.language,
      durationSec: result.durationSec,
      words: result.words,
    }));
  } catch (err) {
    console.error("[recording/transcribe] error:", err);
    return c.json(fail("TRANSCRIPTION_FAILED", `Transcription failed: ${err}`), 500);
  }
});
