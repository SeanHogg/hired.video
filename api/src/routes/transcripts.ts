/**
 * /api/transcripts — one home for transcript operations.
 *
 * GET  /search?q=&limit=              recruiter transcript search (signed in)
 * POST /:responseId/retranscribe      #2145 re-run a failed video-answer
 *                                     transcription (interview creator only):
 *                                     401 unsigned, 503 no provider key,
 *                                     404 missing/not-creator, 400 not a video
 *                                     answer, 409 already pending/completed,
 *                                     202 queued.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { clampLimit } from "../utils/pagination.js";
import { searchTranscripts } from "../services/transcripts/transcript-search.js";
import { requestRetranscription, type RetranscribeClaim } from "../services/interview/retranscribe.js";

type QueuedClaim = Extract<RetranscribeClaim, { outcome: "queued" }>;
type NotRetryableClaim = Extract<RetranscribeClaim, { outcome: "not_retryable" }>;

export const transcriptRoutes = new Hono<AppEnv>();

transcriptRoutes.get("/search", async (c) => {
  if (!c.var.user?.sub) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) {
    return c.json(error("VALIDATION_ERROR", "Query must be at least 2 characters"), 400);
  }
  const hits = await searchTranscripts(q, clampLimit(c.req.query("limit"), 20, 50));
  return c.json(success({ query: q, hits, count: hits.length }), 200);
});

transcriptRoutes.post("/:responseId/retranscribe", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in"), 401);

  const result = await requestRetranscription(
    c.env,
    { responseId: c.req.param("responseId"), userId },
    c.executionCtx?.waitUntil?.bind(c.executionCtx),
  );

  switch (result.outcome) {
    case "unavailable":
      return c.json(error("TRANSCRIPTION_UNAVAILABLE", "Transcription is not configured"), 503);
    case "not_found":
      return c.json(error("NOT_FOUND", "Response not found"), 404);
    case "not_video":
      return c.json(error("NOT_VIDEO", "Only video answers can be transcribed"), 400);
    case "not_retryable":
      return c.json(error("NOT_RETRYABLE", `Transcription is ${(result as NotRetryableClaim).status}`), 409);
    default: {
      const queued = result as QueuedClaim;
      return c.json(success({ responseId: queued.responseId, transcriptionStatus: "pending" }), 202);
    }
  }
});
