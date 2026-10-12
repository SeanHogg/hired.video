/**
 * Async transcription pipeline for video answers on `studio_async_responses`.
 *
 * Background job triggered by POST /api/interview-assignments/:id/respond
 * when responseMode === 'video'. Without this, video answers are invisible
 * to the LLM scorer + to keyword search across past interviews — #1238.
 *
 * Design:
 *   - The orchestrator `transcribeResponse` is dependency-injected (fetch
 *     audio, call Whisper) so unit tests can pin its branching without
 *     touching R2 or hitting OpenAI.
 *   - `transcribeResponseInBackground` is the route-level entrypoint —
 *     it builds the deps from `env`, fires the job through the platform
 *     waitUntil hook when available, and falls back to a detached promise
 *     on Node so local dev still transcribes. Transient failures (5xx,
 *     429, network) retry up to MAX_TRANSCRIBE_ATTEMPTS with backoff
 *     (#2145). Errors never bubble; the
 *     response row's `transcription_status` reflects success/failure
 *     and the recruiter can re-trigger from the review surface.
 */

import { eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { transcribeAudio } from "../adapters/transcription.js";
import type { Env } from "../../types/index.js";

const { studioAsyncResponses } = schema;

export type TranscribeOutcome =
  | { status: "skipped"; reason: string }
  | { status: "completed"; transcription: string }
  | { status: "failed"; error: string };

export interface TranscribeDeps {
  /** Fetch the audio/video bytes for a given URL. Real implementation hits
   *  fetch(); tests stub. */
  fetchAudio: (url: string) => Promise<ArrayBuffer>;
  /** Run the transcription provider on a buffer. Real implementation calls
   *  the OpenAI Whisper adapter; tests stub. */
  transcribe: (audio: ArrayBuffer, filename: string) => Promise<{ text: string }>;
  /** Inject `Date.now()` so tests can assert the timestamp without flake. */
  now?: () => Date;
  /** Bounded automatic retry for transient failures (#2145). Absent = one
   *  attempt. `sleep` is injected so tests never wait on real timers. */
  retry?: TranscribeRetryPolicy;
}

export interface TranscribeRetryPolicy {
  /** Total attempts including the first (clamped to 1..MAX_ATTEMPTS). */
  maxAttempts: number;
  sleep: (ms: number) => Promise<void>;
  /** Wait before attempt N+1 is `backoffMs[N-1]` (last entry repeats). */
  backoffMs?: number[];
}

/** Hard ceiling — a background job must finish well inside waitUntil's
 *  budget on Workers Free. */
export const MAX_TRANSCRIBE_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = [2_000, 6_000];

/** A failure worth retrying: network errors, 5xx, 408 and 429. A 4xx that
 *  says the input is bad (404 missing object, 400 unreadable audio) fails
 *  fast — retrying cannot fix it. */
export function isTransientTranscribeError(message: string): boolean {
  const m = message.match(/\b([45]\d\d)\b/);
  if (!m) return true;
  const code = Number(m[1]);
  if (code >= 500) return true;
  return code === 408 || code === 429;
}

/** Run `step` up to the policy's attempt budget, retrying transient errors. */
async function withTranscribeRetry<T>(
  policy: TranscribeRetryPolicy | undefined,
  step: () => Promise<T>,
): Promise<T> {
  const attempts = Math.max(1, Math.min(MAX_TRANSCRIBE_ATTEMPTS, policy?.maxAttempts ?? 1));
  const backoff = policy?.backoffMs?.length ? policy.backoffMs : DEFAULT_BACKOFF_MS;
  for (let attempt = 1; ; attempt++) {
    try {
      return await step();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= attempts || !policy || !isTransientTranscribeError(msg)) throw err;
      await policy.sleep(backoff[Math.min(attempt - 1, backoff.length - 1)]);
    }
  }
}

export interface TranscribeArgs {
  responseId: string;
  /** Optional video URL — when omitted we read it from the response row. */
  videoUrl?: string | null;
}

/**
 * Pure orchestrator. Returns the outcome; persistence side-effects also
 * happen here (one DB write per state transition) so the route layer only
 * has to fire-and-forget.
 *
 * Branches:
 *   - response not found → skipped
 *   - no videoUrl on the response → skipped
 *   - fetchAudio throws → failed (recorded on the row)
 *   - transcribe throws → failed (recorded on the row)
 *   - happy path → completed (transcription saved + status='completed')
 */
export async function transcribeResponse(
  db: Db,
  deps: TranscribeDeps,
  args: TranscribeArgs,
): Promise<TranscribeOutcome> {
  const now = deps.now ?? (() => new Date());

  const [row] = await db
    .select()
    .from(studioAsyncResponses)
    .where(eq(studioAsyncResponses.id, args.responseId))
    .limit(1);
  if (!row) return { status: "skipped", reason: "response_not_found" };
  if (row.responseMode !== "video") {
    return { status: "skipped", reason: "not_video_mode" };
  }
  const videoUrl = args.videoUrl ?? row.videoUrl;
  if (!videoUrl) return { status: "skipped", reason: "no_video_url" };

  // Mark pending so the recruiter UI can show "transcribing…" rather than
  // a permanently empty transcript while we work.
  await db
    .update(studioAsyncResponses)
    .set({ transcriptionStatus: "pending" } as any)
    .where(eq(studioAsyncResponses.id, args.responseId));

  let audio: ArrayBuffer;
  try {
    audio = await withTranscribeRetry(deps.retry, () => deps.fetchAudio(videoUrl));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(studioAsyncResponses)
      .set({ transcriptionStatus: "failed" } as any)
      .where(eq(studioAsyncResponses.id, args.responseId));
    return { status: "failed", error: `fetch_failed: ${msg}` };
  }

  let text: string;
  try {
    const result = await withTranscribeRetry(deps.retry, () => deps.transcribe(audio, filenameFromUrl(videoUrl)));
    text = result.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(studioAsyncResponses)
      .set({ transcriptionStatus: "failed" } as any)
      .where(eq(studioAsyncResponses.id, args.responseId));
    return { status: "failed", error: `transcribe_failed: ${msg}` };
  }

  // Save the transcript. Don't blow away the AI score — the recruiter may
  // have scored against the textAnswer fallback already; the next re-score
  // pulls the transcript automatically.
  await db
    .update(studioAsyncResponses)
    .set({
      transcription: text,
      transcriptionStatus: "completed",
    } as any)
    .where(eq(studioAsyncResponses.id, args.responseId));

  // Touch the row's timestamp lineage so review surfaces sorting by latest
  // pick this up. Schema doesn't have a dedicated transcribedAt; the row's
  // updatedAt would change if we set it, but `studio_async_responses` lacks
  // an updatedAt column — leaving as-is. Recruiter UI uses
  // transcriptionStatus to trigger a refetch.
  void now;
  return { status: "completed", transcription: text };
}

function filenameFromUrl(url: string): string {
  // Heuristic: pick the path tail; whisper only cares about extension
  // so it can pick mime. Defaults to .webm because the recorder emits webm.
  try {
    const u = new URL(url);
    const tail = u.pathname.split("/").pop() || "audio.webm";
    return tail.includes(".") ? tail : `${tail}.webm`;
  } catch {
    return "audio.webm";
  }
}

/** True when a transcription provider key is configured — callers that
 *  claim a row (→ pending) check this first so a row never sticks at
 *  pending with no job behind it. */
export function hasTranscriptionProvider(env: Env): boolean {
  return Boolean((env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY);
}

/** Route-level entrypoint. Builds deps from the env, fires the job, and
 *  returns immediately. Caller never awaits — errors are swallowed and
 *  reflected in `transcription_status` on the row. */
export function transcribeResponseInBackground(
  env: Env,
  db: Db,
  args: TranscribeArgs,
  waitUntil?: (p: Promise<unknown>) => void,
): void {
  const openaiKey = (env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  if (!openaiKey) {
    // No key — skip silently. Recruiter sees no transcript but no error.
    return;
  }
  const deps: TranscribeDeps = {
    fetchAudio: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      return res.arrayBuffer();
    },
    transcribe: async (audio, filename) => {
      const result = await transcribeAudio(openaiKey, audio, filename);
      return { text: result.text };
    },
    retry: {
      maxAttempts: MAX_TRANSCRIBE_ATTEMPTS,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
  };
  const p = transcribeResponse(db, deps, args).catch((err) => {
    console.error("[transcribe-response] background job failed:", err);
  });
  if (waitUntil) {
    waitUntil(p);
  } else {
    // Node dev: detach. The promise still settles; we just don't block.
    void p;
  }
}
