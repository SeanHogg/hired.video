/**
 * Reading a streamed (SSE) response body under an IDLE deadline: the server
 * heartbeats, so a stream that goes silent for several beats is dead — but a
 * long, live answer never times out. Shared by every streamed client
 * (résumé parse, AI answers).
 */
import { NetworkError } from "@/lib/errors";

export function readWithin(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ms: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new NetworkError("Request timeout", undefined, { transport: true, cause: "idle" })),
      ms,
    );
  });
  return Promise.race([reader.read(), idle]).finally(() => clearTimeout(timer));
}
