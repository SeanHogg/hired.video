/**
 * Client for the streamed résumé parse (`POST /api/resumes/parse` with
 * `Accept: text/event-stream`). Reports stage / page / preview progress as it
 * arrives and resolves with the final JSON Resume content.
 *
 * The only deadline is an IDLE one: the server heartbeats every
 * RESUME_PARSE_HEARTBEAT_MS, so a stream that goes silent for several beats is
 * dead — but a long, live parse (multi-page OCR, a slow model) never times out.
 *
 * Falls back to the JSON envelope if the API answers without streaming.
 */
import { apiClient, broadcastTokenBudget, type RequestConfig } from "@/lib/api-client";
import { NetworkError, ValidationError } from "@/lib/errors";
import { readWithin } from "./sse-read";
import {
  RESUME_PARSE_HEARTBEAT_MS,
  RESUME_PARSE_STREAM_CONTENT_TYPE,
  createResumeParseEventDecoder,
  type ResumeParseStage,
} from "@shared/resume-parse-stream";

export interface ResumeParseProgress {
  stage: ResumeParseStage;
  /** Pages read so far / total, while reading a multi-page upload. */
  page?: number;
  pages?: number;
  /** Latest provisional content (regex pre-parse, then the structured draft). */
  preview: Record<string, unknown> | null;
  /** Client-side only: the result has landed and the UI is playing out the
   *  remaining steps for PARSE_COMPLETE_HOLD_MS before showing it. */
  complete?: boolean;
}

/** How long the intake holds a landed result so the progress UI can visibly
 *  finish every step instead of vanishing mid-checklist. */
export const PARSE_COMPLETE_HOLD_MS = 900;

/** Six missed heartbeats = the connection is gone. */
const IDLE_TIMEOUT_MS = RESUME_PARSE_HEARTBEAT_MS * 6;

export async function streamResumeParse(
  request: RequestConfig,
  onProgress?: (progress: ResumeParseProgress) => void,
): Promise<Record<string, unknown>> {
  const response = await apiClient.openStream("/api/resumes/parse", {
    ...request,
    headers: { ...request.headers, Accept: RESUME_PARSE_STREAM_CONTENT_TYPE },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes(RESUME_PARSE_STREAM_CONTENT_TYPE) || !response.body) {
    return readJsonEnvelope(response);
  }

  const reader = response.body.getReader();
  const text = new TextDecoder();
  const decode = createResumeParseEventDecoder();
  let progress: ResumeParseProgress = { stage: "read", preview: null };
  const report = (next: ResumeParseProgress) => {
    progress = next;
    onProgress?.(next);
  };

  try {
    for (;;) {
      const { done, value } = await readWithin(reader, IDLE_TIMEOUT_MS);
      if (done) break;
      for (const event of decode(text.decode(value, { stream: true }))) {
        if (event.type === "stage") report({ ...progress, stage: event.stage, page: event.page, pages: event.pages });
        else if (event.type === "preview") report({ ...progress, preview: event.content });
        else if (event.type === "result") {
          broadcastTokenBudget(event.tokenBudget);
          return event.content;
        } else if (event.type === "error") {
          throw new ValidationError(event.message, undefined, { code: event.code });
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  throw new NetworkError("Resume parse ended without a result", undefined, { transport: true, cause: "eof" });
}

/** Non-streaming answer: the classic `{ success, data: { result } }` envelope. */
async function readJsonEnvelope(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: { result?: unknown }; error?: { message?: string }; tokenBudget?: unknown }
    | null;
  if (!body?.success || typeof body.data?.result !== "string") {
    throw new ValidationError(body?.error?.message ?? "Invalid resume parse response");
  }
  broadcastTokenBudget(body.tokenBudget);
  return JSON.parse(body.data.result) as Record<string, unknown>;
}
