/**
 * Client for streamed AI answers (#1342, shared/ai-stream.ts): POST to an AI
 * endpoint with `Accept: text/event-stream`, report the model's answer text
 * as it grows, resolve with the validated result.
 *
 * The only deadline is an IDLE one (the server heartbeats). A `reset` event
 * (a model failed mid-answer and the next one starts over) clears the text.
 * Falls back to the JSON envelope when the API answers without streaming.
 */
import type { z } from "zod";
import { apiClient, broadcastTokenBudget } from "@/lib/api-client";
import { AIUsageLimitError, InternalError, NetworkError, ValidationError } from "@/lib/errors";
import { AI_STREAM_HEARTBEAT_MS, type AiStreamEvent } from "@shared/ai-stream";
import { SSE_CONTENT_TYPE, createSseJsonDecoder } from "@shared/sse-json";
import { readWithin } from "./sse-read";

/** Six missed heartbeats = the connection is gone. */
const IDLE_TIMEOUT_MS = AI_STREAM_HEARTBEAT_MS * 6;

export interface AiStreamOptions<T> {
  /** Validates the result, like `apiClient.post`'s schema. */
  schema?: z.ZodType<T>;
  /** The answer text so far, each time it grows (or "" after a reset). */
  onText?: (text: string) => void;
}

/** The typed client error an `error` event stands for. */
export function streamErrorToAppError(event: Extract<AiStreamEvent, { type: "error" }>): Error {
  const context = { serverCode: event.code, httpStatus: event.status, details: event.details };
  if (event.status === 429) return new AIUsageLimitError(event.message, "/pricing", undefined, undefined, undefined, context);
  return new InternalError(event.message, undefined, context);
}

function validated<T>(data: unknown, schema: z.ZodType<T> | undefined): T {
  if (!schema) return data as T;
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return parsed.data;
}

export async function streamAiJson<T>(endpoint: string, body: unknown, options: AiStreamOptions<T> = {}): Promise<T> {
  const response = await apiClient.openStream(endpoint, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
    headers: { "Content-Type": "application/json", Accept: SSE_CONTENT_TYPE },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes(SSE_CONTENT_TYPE) || !response.body) {
    const envelope = (await response.json().catch(() => null)) as { success?: boolean; data?: unknown; tokenBudget?: unknown } | null;
    if (!envelope?.success) throw new ValidationError("Invalid AI response");
    broadcastTokenBudget(envelope.tokenBudget);
    return validated(envelope.data, options.schema);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const decode = createSseJsonDecoder<AiStreamEvent<unknown>>();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await readWithin(reader, IDLE_TIMEOUT_MS);
      if (done) break;
      for (const event of decode(decoder.decode(value, { stream: true }))) {
        if (event.type === "delta") {
          text += event.text;
          options.onText?.(text);
        } else if (event.type === "reset") {
          text = "";
          options.onText?.(text);
        } else if (event.type === "result") {
          broadcastTokenBudget(event.tokenBudget);
          return validated(event.data, options.schema);
        } else if (event.type === "error") {
          throw streamErrorToAppError(event);
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  throw new NetworkError("AI answer ended without a result", undefined, { transport: true, cause: "eof" });
}
