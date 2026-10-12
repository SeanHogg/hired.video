/**
 * POST /api/interview-assignments/:id/responses/:rid/retranscribe (#2145)
 *
 * Re-runs transcription for a video answer whose automatic job failed.
 * Creator-only. Claims the row (→ pending) synchronously, then fires the
 * same background job the respond route uses — which carries its own
 * bounded automatic retry. Returns 202; the review page refetches.
 *
 * Mounted under the interview-assignments router (`.route("/", …)`), so it
 * shares that router's prefix and middleware without a new app.ts mount.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { claimRetranscription } from "../services/interview/retranscribe.js";
import { hasTranscriptionProvider, transcribeResponseInBackground } from "../services/interview/transcribe-response.js";

export const interviewRetranscribeRoutes = new Hono<AppEnv>();

function fail(code: string, message: string) {
  return { success: false as const, error: { code, message }, timestamp: new Date().toISOString() };
}

interviewRetranscribeRoutes.post("/:id/responses/:rid/retranscribe", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);

  if (!hasTranscriptionProvider(c.env)) {
    return c.json(fail("TRANSCRIPTION_UNAVAILABLE", "Transcription is not configured"), 503);
  }

  const db = getDb();
  const claim = await claimRetranscription(db, {
    interviewId: c.req.param("id"),
    responseId: c.req.param("rid"),
    userId: user.sub,
  });

  if (claim.outcome === "not_found") return c.json(fail("NOT_FOUND", "Response not found"), 404);
  if (claim.outcome === "not_video") {
    return c.json(fail("NOT_VIDEO", "Only video answers can be transcribed"), 400);
  }
  if (claim.outcome === "not_retryable") {
    return c.json(fail("NOT_RETRYABLE", `Transcription is ${claim.status}`), 409);
  }

  transcribeResponseInBackground(
    c.env,
    db,
    { responseId: claim.responseId, videoUrl: claim.videoUrl },
    c.executionCtx?.waitUntil?.bind(c.executionCtx),
  );
  return c.json(
    { success: true as const, data: { responseId: claim.responseId, transcriptionStatus: "pending" }, timestamp: new Date().toISOString() },
    202,
  );
});
