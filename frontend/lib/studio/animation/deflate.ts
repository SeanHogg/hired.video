/**
 * Raw deflate compression via `CompressionStream` (zlib-spec deflate
 * without the 2-byte zlib header). Used by the in-tree APNG encoder.
 *
 * Browser support: `CompressionStream` ships in every modern browser
 * since 2023. The fallback (uncompressed deflate blocks) keeps output
 * valid in environments without the API.
 */

export async function deflateRawAsync(input: Uint8Array): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CS = (globalThis as any).CompressionStream;
  if (typeof CS !== "function") return deflateRawUncompressed(input);
  const stream = new CS("deflate-raw");
  const writer = stream.writable.getWriter();
  void writer.write(input);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Synchronous shim — the APNG encoder is sync today. We block the
 *  thread with a single uncompressed-block deflate header so output
 *  is valid even when CompressionStream isn't available. The caller
 *  can switch to `deflateRawAsync` once it adopts async encoding. */
export function deflateRaw(input: Uint8Array): Uint8Array {
  return deflateRawUncompressed(input);
}

/** Uncompressed deflate (block-type 00). Wraps the input in one or
 *  more 64KB-max stored blocks with the correct BFINAL bit. */
function deflateRawUncompressed(input: Uint8Array): Uint8Array {
  const MAX = 0xffff;
  const blocks: Uint8Array[] = [];
  let offset = 0;
  while (offset < input.length) {
    const remaining = input.length - offset;
    const blockLen = Math.min(MAX, remaining);
    const isFinal = offset + blockLen >= input.length;
    const header = new Uint8Array(5);
    header[0] = isFinal ? 0x01 : 0x00;
    header[1] = blockLen & 0xff;
    header[2] = (blockLen >>> 8) & 0xff;
    header[3] = ~blockLen & 0xff;
    header[4] = (~blockLen >>> 8) & 0xff;
    blocks.push(header);
    blocks.push(input.subarray(offset, offset + blockLen));
    offset += blockLen;
  }
  if (blocks.length === 0) {
    // Empty input — emit a single empty final block.
    return new Uint8Array([0x01, 0x00, 0x00, 0xff, 0xff]);
  }
  let total = 0;
  for (const b of blocks) total += b.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const b of blocks) {
    out.set(b, pos);
    pos += b.length;
  }
  return out;
}
