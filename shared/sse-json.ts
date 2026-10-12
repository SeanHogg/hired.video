/**
 * Server-sent events carrying one JSON object per frame (`data: <json>\n\n`) —
 * the framing every streamed endpoint uses (résumé parse, AI answers).
 * Cloudflare never buffers `text/event-stream`, so each frame reaches the
 * browser as it is written.
 */

export const SSE_CONTENT_TYPE = "text/event-stream";

/** Encode one event as an SSE frame. */
export function encodeSseJson(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Incremental SSE frame decoder: feed it text chunks, get back the complete
 * events they finish. Partial frames are carried to the next chunk. Frames
 * that are not JSON objects with a string `type` are skipped (a proxy
 * comment, a stray line).
 */
export function createSseJsonDecoder<E extends { type: string }>(): (chunk: string) => E[] {
  let buffer = "";
  return (chunk) => {
    // Normalise CRLF on the whole buffer, not the chunk: a "\r\n" split across
    // two network chunks would otherwise leave a stray "\r" that hides the
    // frame boundary until a later frame arrives.
    buffer = (buffer + chunk).replace(/\r\n/g, "\n");
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    const events: E[] = [];
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as E;
        if (parsed && typeof parsed === "object" && typeof parsed.type === "string") events.push(parsed);
      } catch {
        // Not one of ours — ignore.
      }
    }
    return events;
  };
}
