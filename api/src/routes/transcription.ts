/**
 * #2145 — transcription retry.
 *
 * The live HTTP handler lives in `interview-retranscribe.ts` and is mounted
 * under `/api/interview-assignments` (see interview-assignments.ts
 * `.route("/", interviewRetranscribeRoutes)`). This module is the
 * workstream-owned path: it re-exports the same Hono app so callers can
 * import `transcriptionRoutes` without registering a second handler at the
 * same prefix.
 *
 * POST /:id/responses/:rid/retranscribe
 *   401 unsigned, 503 no Whisper key, 404 missing/not-creator,
 *   400 not a video answer, 409 already pending/completed, 202 queued.
 */
export {
  interviewRetranscribeRoutes,
  interviewRetranscribeRoutes as transcriptionRoutes,
} from "./interview-retranscribe.js";
