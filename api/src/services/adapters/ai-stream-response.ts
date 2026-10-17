/**
 * A route's long LLM call as a streamed `text/event-stream` answer (#1342),
 * when the client asks for one (`Accept: text/event-stream`). One seam for
 * every streamed AI route (scorer, optimizer, value proposition): the
 * producer gets an `LLMStreamSink` to hand to the LLM port, its validated
 * answer becomes the `result` event, and any throw becomes an `error` event
 * with the same code + status the JSON path would have answered with.
 *
 * Pass-through only (Workers Free, 10 ms CPU): a delta is re-framed as it
 * arrives — no buffering, parsing or per-token work here.
 */
import type { Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import { AI_STREAM_HEARTBEAT_MS, type AiStreamEvent } from "../../../../shared/ai-stream.js";
import { SSE_CONTENT_TYPE, encodeSseJson } from "../../../../shared/sse-json.js";
import { AppError } from "../../middleware/errorHandler.js";
import { TokenBudgetExceededError } from "../../domains/billing/token-ledger.js";
import { buildTokenBudgetDTO } from "../billing/BillingService.js";
import { eventStreamResponse } from "../../utils/event-stream.js";
import { buildAIErrorEnvelope } from "./llm-error.js";
import type { LLMStreamSink } from "./llm-stream.js";
import { logger } from "../../lib/logger.js";

/** Did the client ask for a streamed answer? */
export function wantsEventStream(c: Context<AppEnv>): boolean {
  return (c.req.header("Accept") ?? "").includes(SSE_CONTENT_TYPE);
}

/** A failure the producer reports without throwing (a handler's `fail()`). */
export class AiStreamFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AiStreamFailure";
  }
}

/** The `error` event a throw maps to — the same code / status as the JSON path. */
export function aiStreamErrorEvent(err: unknown): Extract<AiStreamEvent, { type: "error" }> {
  if (err instanceof AiStreamFailure) {
    return { type: "error", code: err.code, message: err.message, status: err.status, ...(err.details ? { details: err.details } : {}) };
  }
  if (err instanceof TokenBudgetExceededError) {
    return { type: "error", code: err.code, message: err.message, status: 429, details: err.summary };
  }
  if (err instanceof AppError) {
    return { type: "error", code: err.code, message: err.message, status: err.status };
  }
  const envelope = buildAIErrorEnvelope(err);
  if (envelope) {
    return { type: "error", code: envelope.code, message: envelope.message, status: envelope.status, details: envelope.payload };
  }
  return {
    type: "error",
    code: "AI_UNAVAILABLE",
    message: "AI providers are temporarily unavailable. Please try again in a minute.",
    status: 503,
  };
}

/** The token-budget envelope the JSON path gets from `attachTokenBudget`;
 *  streamed answers carry it on their final event instead. */
export async function tokenBudgetFor(c: Context<AppEnv>): Promise<unknown> {
  const userId = c.var.user?.sub;
  if (!userId) return undefined;
  return buildTokenBudgetDTO(userId).catch(() => undefined);
}

/**
 * Stream `produce`'s LLM call. `stream` is false for callers whose answer
 * must not leak before shaping (a free-tier teaser): they still get the
 * event framing, but only the final `result`.
 */
export function aiStreamResponse<T>(
  c: Context<AppEnv>,
  produce: (sink: LLMStreamSink | undefined) => Promise<T>,
  opts: { stream?: boolean; tag: string } = { tag: "[ai-stream]" },
): Response {
  return eventStreamResponse<AiStreamEvent<T>>(
    async (emit) => {
      const sink: LLMStreamSink | undefined =
        opts.stream === false
          ? undefined
          : { onDelta: (text) => emit({ type: "delta", text }), onReset: () => emit({ type: "reset" }) };
      try {
        const data = await produce(sink);
        emit({ type: "result", data, tokenBudget: await tokenBudgetFor(c) });
      } catch (err) {
        logger.error(opts.tag, { error: err instanceof Error ? err.message : err });
        emit(aiStreamErrorEvent(err));
      }
    },
    { encode: encodeSseJson, heartbeat: { type: "ping" }, heartbeatMs: AI_STREAM_HEARTBEAT_MS },
  );
}
