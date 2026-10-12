/**
 * Résumé parse progress stream — the wire contract between
 * `POST /api/resumes/parse` (when the client sends `Accept: text/event-stream`)
 * and the web client.
 *
 * A full parse is several model round-trips (vision OCR per page, one
 * structuring pass, optional section/date/skill refinements). Streaming the
 * stages, early previews and a heartbeat keeps the connection alive and lets
 * the UI show what has been found so far — the client deadline becomes an
 * IDLE deadline (time since the last event), never a total one.
 *
 * Framing is SSE (`data: <json>\n\n`): Cloudflare never buffers
 * `text/event-stream`, so each event reaches the browser as it is written.
 */

import { SSE_CONTENT_TYPE, createSseJsonDecoder, encodeSseJson } from "./sse-json.js";

export const RESUME_PARSE_STREAM_CONTENT_TYPE = SSE_CONTENT_TYPE;

/** Server heartbeat cadence. The client idle deadline must comfortably exceed it. */
export const RESUME_PARSE_HEARTBEAT_MS = 10_000;

/** Ordered pipeline stages, as the UI narrates them. */
export const RESUME_PARSE_STAGES = ["read", "ocr", "structure", "refine"] as const;
export type ResumeParseStage = (typeof RESUME_PARSE_STAGES)[number];

export type ResumeParseEvent =
  /** A stage began. `ocr` carries page progress for multi-page scans. */
  | { type: "stage"; stage: ResumeParseStage; page?: number; pages?: number }
  /** Provisional content — the instant regex pre-parse, then the structured
   *  draft before refinement. Never final; the `result` event supersedes it. */
  | { type: "preview"; content: Record<string, unknown> }
  /** The final parsed JSON Resume. `tokenBudget` mirrors the JSON envelope's
   *  piggy-backed budget for signed-in callers. */
  | { type: "result"; content: Record<string, unknown>; tokenBudget?: unknown }
  | { type: "error"; code: string; message: string }
  | { type: "ping" };

/** Encode one event as an SSE frame. */
export function encodeResumeParseEvent(event: ResumeParseEvent): string {
  return encodeSseJson(event);
}

/**
 * Incremental SSE frame decoder: feed it text chunks, get back the complete
 * events they finish (shared framing, sse-json.ts).
 */
export function createResumeParseEventDecoder(): (chunk: string) => ResumeParseEvent[] {
  return createSseJsonDecoder<ResumeParseEvent>();
}
