/**
 * Image proxy rules (pure) — what GET /api/media/image may fetch on a
 * signed-in owner's behalf so the browser can draw a remote image into a
 * canvas without tainting it (document downloads rasterize free elements).
 *
 *   • http(s) only, no credentials in the URL, default ports only
 *   • never a loopback / private / link-local / metadata host (SSRF)
 *   • the response must be an image/* type, at most MAX_PROXY_IMAGE_BYTES
 *   • redirects are followed by hand (≤ MAX_PROXY_REDIRECTS), every hop
 *     re-checked — `redirect: "follow"` would let a hop hit a private host
 *
 * Also used by the explicit image scan (services/moderation/explicit/
 * imageScan.ts) to fetch the user-supplied asset URLs a public video uses.
 */

export const MAX_PROXY_IMAGE_BYTES = 15 * 1024 * 1024;

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^198\.1[89]\./, // 198.18.0.0/15 benchmarking
  /^(22[4-9]|2[3-5]\d)\./, // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + broadcast
];

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return PRIVATE_V4.some((r) => r.test(h));
  if (h.includes(":")) {
    // IPv6 literal: loopback, unspecified, unique-local, link-local, v4-mapped.
    return h === "::1" || h === "::" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("::ffff:");
  }
  // A bare number (decimal / hex IPv4 forms) is never a real image host.
  return /^(0x[0-9a-f]+|\d+)$/.test(h);
}

/** The URL to fetch, or null when the proxy must refuse it. */
export function parseProxyTarget(raw: string | undefined | null): URL | null {
  if (!raw || raw.length > 4096) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  if (!url.hostname || isPrivateHost(url.hostname)) return null;
  return url;
}

export function isImageContentType(value: string | null | undefined): boolean {
  if (!value) return false;
  const type = value.split(";")[0].trim().toLowerCase();
  // SVG can carry script; a canvas would draw it but we never re-serve it.
  return type.startsWith("image/") && type !== "image/svg+xml";
}

export const MAX_PROXY_REDIRECTS = 3;

/**
 * Fetch a public URL (already passed through parseProxyTarget), following at
 * most `maxRedirects` redirects by hand and re-checking each Location
 * (relative ones resolved against the hop). Null when a hop is refused or
 * there are too many; network errors throw.
 */
export async function fetchPublicUrl(
  target: URL,
  init: Omit<RequestInit, "redirect"> = {},
  fetchImpl: typeof fetch = fetch,
  maxRedirects: number = MAX_PROXY_REDIRECTS,
): Promise<Response | null> {
  let url = target;
  for (let hop = 0; ; hop++) {
    const res = await fetchImpl(url.toString(), { ...init, redirect: "manual" });
    if (res.status < 300 || res.status > 399 || res.status === 304) return res;
    const location = res.headers.get("location");
    await res.body?.cancel().catch(() => undefined);
    if (!location || hop >= maxRedirects) return null;
    let next: URL | null = null;
    try {
      next = parseProxyTarget(new URL(location, url).toString());
    } catch {
      next = null;
    }
    if (!next) return null;
    url = next;
  }
}

/** Read from `reader` until done or more than `limit` bytes arrived. */
async function readUpTo(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  limit: number,
): Promise<{ chunks: Uint8Array[]; total: number; overflow: boolean }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { chunks, total, overflow: false };
    chunks.push(value);
    total += value.byteLength;
    if (total > limit) return { chunks, total, overflow: true };
  }
}

function concatChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function declaredLength(res: Response): number {
  return Number(res.headers.get("content-length") ?? "0") || 0;
}

/** Read at most `limit` bytes; null when the body is larger (streaming cap —
 *  a missing / lying content-length can't make it buffer more). */
export async function readCapped(res: Response, limit: number): Promise<ArrayBuffer | null> {
  if (declaredLength(res) > limit) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.body) return new ArrayBuffer(0);
  const reader = res.body.getReader();
  const { chunks, total, overflow } = await readUpTo(reader, limit);
  if (overflow) {
    await reader.cancel().catch(() => undefined);
    return null;
  }
  return concatChunks(chunks, total).buffer as ArrayBuffer;
}

/** `prefix` then the rest of `reader`, erroring once more than `limit`
 *  bytes have passed through. */
function cappedStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  prefix: readonly Uint8Array[],
  limit: number,
): ReadableStream<Uint8Array> {
  const queue = [...prefix];
  let total = prefix.reduce((n, c) => n + c.byteLength, 0);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const head = queue.shift();
      if (head) {
        controller.enqueue(head);
        return;
      }
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        controller.error(new Error(`body exceeds ${limit} bytes`));
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

export type CappedBody =
  | { kind: "bytes"; bytes: Uint8Array }
  | { kind: "stream"; stream: ReadableStream<Uint8Array> };

/**
 * A body of at most `bufferLimit` bytes comes back buffered; a larger one (up
 * to `streamLimit`) comes back as a capped stream — never buffered — so a
 * caller can pipe it on (e.g. into the Cloudflare Images binding). Null when
 * it is declared larger than `streamLimit`.
 */
export async function readBytesOrStream(res: Response, bufferLimit: number, streamLimit: number): Promise<CappedBody | null> {
  const declared = declaredLength(res);
  if (declared > streamLimit) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.body) return { kind: "bytes", bytes: new Uint8Array(0) };
  const reader = res.body.getReader();
  if (declared > bufferLimit) return { kind: "stream", stream: cappedStream(reader, [], streamLimit) };
  const { chunks, total, overflow } = await readUpTo(reader, bufferLimit);
  if (!overflow) return { kind: "bytes", bytes: concatChunks(chunks, total) };
  return { kind: "stream", stream: cappedStream(reader, chunks, streamLimit) };
}
