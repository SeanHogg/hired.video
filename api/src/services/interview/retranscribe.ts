/**
 * Recruiter-triggered re-transcription of a video answer (#2145).
 *
 * The automatic job (transcribe-response.ts) already retries transient
 * failures a bounded number of times. When it still lands on `failed`
 * (Whisper outage, R2 briefly unreachable), the interview's creator can
 * re-run it from the review page. This module owns the authorization and
 * the atomic claim; the route only maps the outcome to HTTP.
 *
 * The claim flips `failed`/never-run → `pending` in ONE conditional update,
 * so a double-click or two open tabs queue a single job.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";

const { studioAsyncInterviews, studioAsyncResponses } = schema;

export type RetranscribeClaim =
  | { outcome: "not_found" }
  | { outcome: "not_video" }
  | { outcome: "not_retryable"; status: string }
  | { outcome: "queued"; responseId: string; videoUrl: string };

export interface RetranscribeArgs {
  interviewId: string;
  responseId: string;
  /** The signed-in user — must be the interview's creator. */
  userId: string;
}

/** Statuses a recruiter may re-run from. `null` = the job never ran (e.g.
 *  no transcription key at the time). `completed` and `pending` are not. */
export function isRetranscribable(status: string | null | undefined): boolean {
  return status === "failed" || status === null || status === undefined;
}

export async function claimRetranscription(db: Db, args: RetranscribeArgs): Promise<RetranscribeClaim> {
  const [interview] = await db
    .select({ id: studioAsyncInterviews.id })
    .from(studioAsyncInterviews)
    .where(and(eq(studioAsyncInterviews.id, args.interviewId), eq(studioAsyncInterviews.recruiterId, args.userId)))
    .limit(1);
  if (!interview) return { outcome: "not_found" };

  const [response] = await db
    .select({
      id: studioAsyncResponses.id,
      responseMode: studioAsyncResponses.responseMode,
      videoUrl: studioAsyncResponses.videoUrl,
      transcriptionStatus: studioAsyncResponses.transcriptionStatus,
    })
    .from(studioAsyncResponses)
    .where(and(eq(studioAsyncResponses.id, args.responseId), eq(studioAsyncResponses.interviewId, args.interviewId)))
    .limit(1);
  if (!response) return { outcome: "not_found" };
  if (response.responseMode !== "video" || !response.videoUrl) return { outcome: "not_video" };
  if (!isRetranscribable(response.transcriptionStatus)) {
    return { outcome: "not_retryable", status: response.transcriptionStatus ?? "unknown" };
  }

  const claimed = await db
    .update(studioAsyncResponses)
    .set({ transcriptionStatus: "pending" })
    .where(
      and(
        eq(studioAsyncResponses.id, response.id),
        or(eq(studioAsyncResponses.transcriptionStatus, "failed"), isNull(studioAsyncResponses.transcriptionStatus)),
      ),
    )
    .returning({ id: studioAsyncResponses.id });
  if (claimed.length === 0) return { outcome: "not_retryable", status: "pending" };

  return { outcome: "queued", responseId: response.id, videoUrl: response.videoUrl };
}
