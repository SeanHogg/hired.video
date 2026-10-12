/**
 * Long-running work → a streamed `text/event-stream` Response.
 *
 * `produce` runs after the headers are sent and emits events as it goes; a
 * heartbeat event is written every `heartbeatMs` so neither the browser's
 * idle deadline nor an intermediary drops a connection whose next real event
 * is a slow model call away. Emits after the client disconnects are dropped.
 *
 * `produce` owns its error reporting (emit a domain error event); a throw
 * that escapes it just closes the stream.
 */
export function eventStreamResponse<E>(
  produce: (emit: (event: E) => void) => Promise<void>,
  { encode, heartbeat, heartbeatMs }: { encode: (event: E) => string; heartbeat: E; heartbeatMs: number },
): Response {
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: E): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encode(event)));
        } catch {
          closed = true;
        }
      };
      timer = setInterval(() => emit(heartbeat), heartbeatMs);
      void produce(emit)
        .catch((err) => console.error("[event-stream] producer failed:", err instanceof Error ? err.message : err))
        .finally(() => {
          clearInterval(timer);
          if (closed) return;
          closed = true;
          controller.close();
        });
    },
    cancel() {
      closed = true;
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: keep Cloudflare from compressing (and so buffering) the stream.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
